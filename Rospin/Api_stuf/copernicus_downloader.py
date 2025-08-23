import os, requests, zipfile
from getpass import getpass

CLIENT_ID = "cdse-public"

def get_tokens(username, password):
    token_url = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
    response = requests.post(
        token_url,
        data={"client_id": CLIENT_ID, "username": username, "password": password, "grant_type": "password"}
    )
    token_data = response.json()
    return token_data["access_token"], token_data["refresh_token"]

def search_products(headers, aoi_wkt, start_date, end_date, maxRecords=1):
    BASE_URL = "https://catalogue.dataspace.copernicus.eu/resto/api/collections/Sentinel1/search.json"
    query_params = {
        "startDate": start_date,
        "completionDate": end_date,
        "productType": "GRD",
        "sensorMode": "IW",
        "geometry": aoi_wkt,
        "maxRecords": maxRecords
    }
    response = requests.get(BASE_URL, params=query_params, headers=headers)
    response.raise_for_status()
    return response.json().get("features", [])

def download_and_extract(product, headers, download_dir):
    title = product["properties"]["title"]
    product_id = product["id"]
    extract_path = os.path.join(download_dir, title)  # Directory name matches zip (without .zip)
    zip_file_path = os.path.join(download_dir, f"{title}.zip")

    if not os.path.exists(zip_file_path):
        url = f"https://download.dataspace.copernicus.eu/odata/v1/Products({product_id})/$value"
        with requests.get(url, headers=headers, stream=True) as r:
            r.raise_for_status()
            with open(zip_file_path, "wb") as f:
                for chunk in r.iter_content(8192):
                    f.write(chunk)
    # Always extract to extract_path, even if SAFE folder is inside the zip
    if not os.path.exists(extract_path):
        with zipfile.ZipFile(zip_file_path, "r") as zip_ref:
            zip_ref.extractall(extract_path)

    return extract_path
