import os
import argparse
from shapely.geometry import box
from shapely import wkt
from shapely.ops import transform
import pyproj
from getpass import getpass

from copernicus_downloader import get_tokens, search_products, download_and_extract
from flood_detection import detect_flood
from database import save_flood_result, get_flood_events

def parse_arguments():
    parser = argparse.ArgumentParser(description="Flood risk assessment with Sentinel-1 data.")
    parser.add_argument("--username", type=str, required=True, help="Copernicus username/email")
    parser.add_argument("--password", type=str, help="Copernicus password (or leave empty to enter securely)")
    parser.add_argument("--start", type=str, required=True, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", type=str, required=True, help="End date (YYYY-MM-DD)")
    parser.add_argument("--aoi", type=str, required=True,
                        help="Area of Interest as WKT string OR bbox: minx,miny,maxx,maxy")
    parser.add_argument("--buffer", type=int, default=2000,
                        help="Buffer around AOI in meters (default: 2000m)")
    parser.add_argument("--download_dir", type=str, default="copernicus_data_S1",
                        help="Directory to store downloaded Sentinel-1 products")
    return parser.parse_args()

def prepare_aoi(aoi_str, buffer_m):
    try:
        # If input looks like a bbox: four numbers separated by commas
        parts = aoi_str.split(",")
        if len(parts) == 4 and all(p.replace('.', '', 1).replace('-', '', 1).isdigit() for p in parts):
            minx, miny, maxx, maxy = map(float, parts)
            geom = box(minx, miny, maxx, maxy)
        else:  # Assume WKT string
            geom = wkt.loads(aoi_str)
    except Exception as e:
        raise ValueError(f"Invalid AOI format: {e}")

    project = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True).transform
    geom_buffered = transform(project, geom).buffer(buffer_m)
    geom_buffered = transform(pyproj.Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True).transform, geom_buffered)
    return geom_buffered.wkt

def find_measurement_folder(safe_path):
    # Check for nested .SAFE folder
    for item in os.listdir(safe_path):
        inner = os.path.join(safe_path, item)
        if item.endswith('.SAFE') and os.path.isdir(inner):
            measurement = os.path.join(inner, "measurement")
            if os.path.isdir(measurement):
                return measurement
    # Fallback: check directly in safe_path
    measurement = os.path.join(safe_path, "measurement")
    if os.path.isdir(measurement):
        return measurement
    raise FileNotFoundError(f"No measurement folder found in {safe_path}")

def main():
    args = parse_arguments()
    if not args.password:
        args.password = getpass("Enter Copernicus password: ")

    os.makedirs(args.download_dir, exist_ok=True)

    # Prepare AOI
    aoi_wkt = prepare_aoi(args.aoi, args.buffer)

    # Authenticate
    access_token, refresh_token = get_tokens(args.username, args.password)
    headers = {"Authorization": f"Bearer {access_token}"}

    # Search
    products = search_products(headers, aoi_wkt, args.start, args.end)
    if not products:
        print("No products found.")
        return

    products.sort(key=lambda x: x["properties"]["startDate"])
    pre_product, post_product = products[0], products[-1]

    # Download & extract
    pre_path = download_and_extract(pre_product, headers, args.download_dir)
    post_path = download_and_extract(post_product, headers, args.download_dir)

    # Pick one TIFF file from SAFE folder (simplified)
    pre_measurements = find_measurement_folder(pre_path)
    post_measurements = find_measurement_folder(post_path)

    pre_tif_files = [os.path.join(pre_measurements, f) for f in os.listdir(pre_measurements) if f.endswith(".tiff")]
    post_tif_files = [os.path.join(post_measurements, f) for f in os.listdir(post_measurements) if f.endswith(".tiff")]

    if not pre_tif_files or not post_tif_files:
        raise FileNotFoundError("No .tiff files found in measurement folders.")

    pre_tif = pre_tif_files[0]
    post_tif = post_tif_files[0]

    # Flood detection
    mask_path, flooded_pct, flooded_geom = detect_flood(pre_tif, post_tif, os.path.join(args.download_dir, "flood_mask.tif"))

    # Save results
    save_flood_result(aoi_wkt, pre_product, post_product, mask_path, flooded_pct, flooded_geom)
    print(f"Flood detection completed. {flooded_pct:.2f}% flooded. Results saved to DB.")

    # Show DB results
    events = get_flood_events()
    print("\nStored flood events:")
    for e in events:
        print(f" - Event {e.id}: {e.flooded_pct:.2f}% flooded on {e.post_date.date()}")

if __name__ == "__main__":
    main()
