# main.py
import os
import pandas as pd
from getpass import getpass
from concurrent.futures import ThreadPoolExecutor, as_completed

from downloader import get_tokens, search_products, download_and_extract
from satellite_down import SafeProcessor


def main():
    # --- Authentication ---
    username = input("Copernicus Username: ")
    password = getpass("Copernicus Password: ")
    access_token, _ = get_tokens(username, password)
    headers = {"Authorization": f"Bearer {access_token}"}

    # --- Search area and dates (Bucharest AOI example) ---
    aoi_wkt = "POLYGON((26.0 44.4, 26.2 44.4, 26.2 44.6, 26.0 44.6, 26.0 44.4))"
    start_date = "2023-01-01T00:00:00Z"
    end_date = "2023-12-31T23:59:59Z"

    download_dir = "downloads"
    os.makedirs(download_dir, exist_ok=True)

    # --- Search Sentinel-1 ---
    s1_products = search_products(
        headers, aoi_wkt, start_date, end_date,
        collection="Sentinel1",
        extra_params={"productType": "GRD", "sensorMode": "IW"},
        maxRecords=1
    )

    # --- Search Sentinel-2 ---
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

    all_products = []
    all_products.extend(s1_products)
    all_products.extend(s2_products)

    # --- Parallel download + extraction ---
    paths = []
    if all_products:
        with ThreadPoolExecutor(max_workers=4) as executor:
            future_to_product = {
                executor.submit(download_and_extract, product, headers, download_dir): product
                for product in all_products
            }
            for future in as_completed(future_to_product):
                product = future_to_product[future]
                try:
                    path = future.result()
                    print(f"{product['properties']['title']} downloaded and extracted to: {path}")
                    paths.append(path)
                except Exception as e:
                    print(f"❌ Error downloading {product['properties']['title']}: {e}")

    # split into S1 / S2 paths
    s1_paths = [p for p in paths if "S1" in os.path.basename(p)]
    s2_paths = [p for p in paths if "S2" in os.path.basename(p)]
    processor = SafeProcessor(download_dir=download_dir)
    '''
    # --- Link S1–S2 by closest acquisition date ---
    
    s2_map = {}
    for s1_path in s1_paths:
        dt1 = processor.extract_datetime_from_safe(s1_path)
        if not dt1:
            continue
        closest_s2 = None
        min_diff = None
        for s2_path in s2_paths:
            dt2 = processor.extract_datetime_from_safe(s2_path)
            if not dt2:
                continue
            diff = abs((dt1 - dt2).total_seconds())
            if min_diff is None or diff < min_diff:
                min_diff = diff
                closest_s2 = s2_path
        if closest_s2:
            s2_map[s1_path] = closest_s2
    '''
    s2_map = {s2_paths}
    # --- Process and save ---
    if s1_paths:
        df = processor.process_safe_folders(s1_paths, output_prefix="bucharest_flood", s2_mapping=s2_map)

        # also save to HDF5
        h5_file = "bucharest_flood.h5"
        df.to_hdf(h5_file, key="data", mode="a")
        print(f"Saved results to {h5_file}")
    else:
        print("⚠️ No Sentinel-1 products available for processing.")


if __name__ == "__main__":
    main()
