# Install necessary libraries (if not already installed)
# pip install shapely rasterio

import os
import requests
import zipfile
from shapely.geometry import box
from shapely.ops import transform
import pyproj
from getpass import getpass

# === USER INPUTS ===
USERNAME = input("Enter your username/email: ")
PASSWORD = getpass("Enter your password: ")
CLIENT_ID = "cdse-public"

# Define output directory
DOWNLOAD_DIR = "copernicus_data_S1"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Define date range (event window)
start_date = "2021-12-01"
end_date = "2022-01-15"

# Example AOI (very small) → buffer it by ~2 km
aoi = box(26.054215, 44.444096, 26.056807, 44.444091)

project = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True).transform
aoi_buffered = transform(project, aoi).buffer(2000)  # 2 km buffer
aoi_buffered = transform(pyproj.Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True).transform, aoi_buffered)
aoi_wkt = aoi_buffered.wkt

# === AUTHENTICATION ===
def get_tokens():
    token_url = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
    response = requests.post(
        token_url,
        data={
            "client_id": CLIENT_ID,
            "username": USERNAME,
            "password": PASSWORD,
            "grant_type": "password"
        }
    )
    if response.status_code == 200:
        token_data = response.json()
        return token_data["access_token"], token_data["refresh_token"]
    else:
        raise Exception("Failed to retrieve tokens:", response.status_code, response.text)

def refresh_access_token(refresh_token):
    token_url = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
    response = requests.post(
        token_url,
        data={
            "client_id": CLIENT_ID,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token
        }
    )
    if response.status_code == 200:
        return response.json()["access_token"]
    else:
        raise Exception("Failed to refresh access token:", response.status_code, response.text)

# Get tokens
access_token, refresh_token = get_tokens()
headers = {"Authorization": f"Bearer {access_token}"}

# === SEARCH FOR PRODUCTS ===
BASE_URL = "https://catalogue.dataspace.copernicus.eu/resto/api/collections/Sentinel1/search.json"

query_params = {
    "startDate": start_date,
    "completionDate": end_date,
    "productType": "GRD",
    "sensorMode": "IW",          # Interferometric Wide Swath
    # "polarisationMode": "VV VH", # Dual polarization
    "geometry": aoi_wkt,
    "maxRecords": 5             # allow more than 1 product
}

response = requests.get(BASE_URL, params=query_params, headers=headers)

if response.status_code == 200:
    results = response.json()
    products = results.get("features", [])

    if products:
        print(f"Found {len(products)} Sentinel-1 products for the specified criteria.")

        # Sort by acquisition date
        products.sort(key=lambda x: x["properties"]["startDate"])

        # Select first (earliest, pre-flood) and last (latest, post-flood)
        selected = [products[0], products[-1]]

        for product in selected:
            title = product["properties"]["title"]
            product_id = product["id"]
            extract_path = os.path.join(DOWNLOAD_DIR, title)
            zip_file_path = os.path.join(DOWNLOAD_DIR, f"{title}.zip")

            if os.path.exists(extract_path):
                print(f"Product {title} already extracted. Skipping...")
                continue

            if not os.path.exists(zip_file_path):
                download_url = f"https://download.dataspace.copernicus.eu/odata/v1/Products({product_id})/$value"
                session = requests.Session()
                session.headers.update(headers)

                download_response = session.get(download_url, stream=True)
                if download_response.status_code == 401:
                    access_token = refresh_access_token(refresh_token)
                    session.headers.update({"Authorization": f"Bearer {access_token}"})
                    download_response = session.get(download_url, stream=True)

                if download_response.status_code == 200:
                    with open(zip_file_path, "wb") as file:
                        for chunk in download_response.iter_content(chunk_size=8192):
                            file.write(chunk)
                    print(f"Downloaded {title}.")
                else:
                    print(f"Failed to download {title}. Status code: {download_response.status_code}")
                    continue
            else:
                print(f"Zip file for {title} already exists. Skipping download...")

            # Extract product
            if not os.path.exists(extract_path):
                with zipfile.ZipFile(zip_file_path, 'r') as zip_ref:
                    zip_ref.extractall(extract_path)
                print(f"Extracted {title}.")

    else:
        print("No Sentinel-1 products found. Try different dates or expand AOI.")
else:
    print(f"Search request failed: {response.status_code} {response.text}")

print("Process completed.")
