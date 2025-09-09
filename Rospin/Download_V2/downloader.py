import os, requests, zipfile
from getpass import getpass
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor, as_completed

CLIENT_ID = "cdse-public"

def get_tokens(username, password):
    token_url = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
    response = requests.post(
        token_url,
        data={"client_id": CLIENT_ID, "username": username, "password": password, "grant_type": "password"}
    )
    response.raise_for_status()
    token_data = response.json()
    return token_data["access_token"], token_data["refresh_token"]

def search_products(headers, aoi_wkt, start_date, end_date, collection, extra_params=None, maxRecords=1):
    """
    Generic search function for Sentinel-1 or Sentinel-2.
    collection: "Sentinel1" or "Sentinel2"
    """
    BASE_URL = f"https://catalogue.dataspace.copernicus.eu/resto/api/collections/{collection}/search.json"
    query_params = {
        "startDate": start_date,
        "completionDate": end_date,
        "geometry": aoi_wkt,
        "maxRecords": maxRecords
    }
    if extra_params:
        query_params.update(extra_params)

    response = requests.get(BASE_URL, params=query_params, headers=headers)
    response.raise_for_status()
    return response.json().get("features", [])

def download_and_extract(product, headers, download_dir):
    title = product["properties"]["title"]
    product_id = product["id"]
    extract_path = os.path.join(download_dir, title)  # downloads/product_name
    zip_file_path = os.path.join(download_dir, f"{title}.zip")

    # Download only if zip is not present
    if not os.path.exists(zip_file_path):
        url = f"https://download.dataspace.copernicus.eu/odata/v1/Products({product_id})/$value"
        with requests.get(url, headers=headers, stream=True) as r:
            r.raise_for_status()
            total_size = int(r.headers.get("Content-Length", 0))
            with open(zip_file_path, "wb") as f, tqdm(
                total=total_size, unit="B", unit_scale=True, desc=title, ascii=True
            ) as pbar:
                for chunk in r.iter_content(8192):
                    f.write(chunk)
                    pbar.update(len(chunk))

    # Always extract, flattening top-level SAFE folder if present
    if not os.path.exists(extract_path):
        os.makedirs(extract_path, exist_ok=True)
        with zipfile.ZipFile(zip_file_path, "r") as zip_ref:
            for member in zip_ref.namelist():
                parts = member.split("/", 1)
                member_target = parts[1] if len(parts) > 1 else parts[0]

                if member_target:  # Skip empty
                    target_path = os.path.join(extract_path, member_target)
                    if member.endswith("/"):  # directory
                        os.makedirs(target_path, exist_ok=True)
                    else:  # file
                        os.makedirs(os.path.dirname(target_path), exist_ok=True)
                        with zip_ref.open(member) as src, open(target_path, "wb") as dst:
                            dst.write(src.read())

    return extract_path


'''if __name__ == "__main__":
    username = input("Copernicus Username: ")
    password = getpass("Copernicus Password: ")

    access_token, refresh_token = get_tokens(username, password)
    headers = {"Authorization": f"Bearer {access_token}"}

    # Example AOI (WKT for a small area in Bucharest)
    aoi_wkt = "POLYGON((26.0 44.4, 26.2 44.4, 26.2 44.6, 26.0 44.6, 26.0 44.4))"
    start_date = "2023-01-01T00:00:00Z"
    end_date = "2023-12-31T23:59:59Z"

    download_dir = "downloads"
    os.makedirs(download_dir, exist_ok=True)

    # --- Sentinel-1 search (GRD, IW mode) ---
    s1_products = search_products(
        headers, aoi_wkt, start_date, end_date,
        collection="Sentinel1",
        extra_params={"productType": "GRD", "sensorMode": "IW"},
        maxRecords=1
    )

    # --- Sentinel-2 search (L2A preferred, fallback to L1C) ---
    s2_products = search_products(
        headers, aoi_wkt, start_date, end_date,
        collection="Sentinel2",
        extra_params={"productType": "S2MSI2A"},
        maxRecords=1
    )
    if not s2_products:
        s2_products = search_products(
            headers, aoi_wkt, start_date, end_date,
            collection="Sentinel2",
            extra_params={"productType": "S2MSI1C"},
            maxRecords=1
        )

    # Combine both sets
    all_products = []
    if s1_products:
        all_products.extend(s1_products)
    else:
        print("No Sentinel-1 products found for the given criteria.")
    if s2_products:
        all_products.extend(s2_products)
    else:
        print("No Sentinel-2 products found for the given criteria.")

    # --- Parallel download & extraction ---
    if all_products:
        with ThreadPoolExecutor(max_workers=2) as executor:
            future_to_product = {
                executor.submit(download_and_extract, product, headers, download_dir): product
                for product in all_products
            }
            for future in as_completed(future_to_product):
                product = future_to_product[future]
                try:
                    path = future.result()
                    print(f"{product['properties']['title']} downloaded and extracted to: {path}")
                except Exception as e:
                    print(f"Error downloading {product['properties']['title']}: {e}")
'''