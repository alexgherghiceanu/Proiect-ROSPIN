import os
import rasterio
import numpy as np
import pandas as pd
from rasterio.warp import transform

class SafeProcessor:
    def __init__(self, download_dir="downloads"):
        self.download_dir = download_dir
        os.makedirs(download_dir, exist_ok=True)

    def process_safe_product(self, safe_dir):
        """Find VV/VH GeoTIFFs in SAFE folder and compute means."""
        meas_dir = os.path.join(safe_dir, "measurement")
        vv_file = vh_file = None
        for tif in os.listdir(meas_dir):
            if tif.lower().endswith((".tif", ".tiff")):
                name = os.path.basename(tif).upper()
                if "VV" in name:
                    vv_file = os.path.join(meas_dir, tif)
                elif "VH" in name:
                    vh_file = os.path.join(meas_dir, tif)

        if not vv_file or not vh_file:
            raise FileNotFoundError("Missing VV/VH tiffs in SAFE folder")

        vv_mean, vh_mean = self._compute_means(vv_file, vh_file)
        return vv_file, vh_file, vv_mean, vh_mean

    def _compute_means(self, vv_path, vh_path):
        with rasterio.open(vv_path) as vv_src, rasterio.open(vh_path) as vh_src:
            vv_mean = float(np.nanmean(vv_src.read(1)))
            vh_mean = float(np.nanmean(vh_src.read(1)))
        return vv_mean, vh_mean

    def extract_datetime_from_safe(self, safe_dir):
        """Extract start and end datetime from SAFE folder name."""
        basename = os.path.basename(safe_dir)
        parts = basename.split("_")
        start_str = parts[4]  # e.g., '20240601T044510'
        end_str = parts[5]    # e.g., '20240601T044535'

        start_dt = pd.to_datetime(start_str, format="%Y%m%dT%H%M%S")
        end_dt = pd.to_datetime(end_str, format="%Y%m%dT%H%M%S")
        return start_dt, end_dt

    def extract_center_latlon(self, tif_path):
        """Extract human-readable latitude and longitude from a GeoTIFF."""
        with rasterio.open(tif_path) as src:
            center_x = src.width // 2
            center_y = src.height // 2

            # Get coordinates in raster CRS
            x, y = rasterio.transform.xy(src.transform, center_y, center_x)

            # Transform to WGS84 (EPSG:4326)
            if src.crs is not None:
                lon, lat = transform(src.crs, "EPSG:4326", [x], [y])
                return float(lat[0]), float(lon[0])
            else:
                # fallback if CRS missing
                return float(y), float(x)

    def process_safe_folders(self, safe_folders, output_prefix="output"):
        """Process a list of local SAFE folder paths."""
        rows = []
        for safe_dir in safe_folders:
            try:
                vv_file, vh_file, vv_mean, vh_mean = self.process_safe_product(safe_dir)
                start_dt, end_dt = self.extract_datetime_from_safe(safe_dir)
                lat, lon = self.extract_center_latlon(vv_file)
                print(f"Processed {safe_dir}: VV={vv_mean:.3f}, VH={vh_mean:.3f}, "
                      f"lat={lat:.6f}, lon={lon:.6f}")
            except Exception as e:
                print(f"Failed {safe_dir}: {e}")
                vv_mean = vh_mean = lat = lon = start_dt = end_dt = None

            rows.append({
                "start_datetime": start_dt,
                "end_datetime": end_dt,
                "latitude": lat/320,
                "longitude": lon/320,
                "vv_mean": vv_mean,
                "vh_mean": vh_mean
            })

        df = pd.DataFrame(rows)

        # Save CSV
        csv_file = f"{output_prefix}.csv"
        df.to_csv(csv_file, index=False)

        # Save HDF5
        h5_file = f"{output_prefix}.h5"
        try:
            df.to_hdf(h5_file, key="data", mode="w")
        except ImportError:
            print("⚠️ Install `pytables` to enable HDF5 saving: pip install tables")

        print(f"Saved results to {csv_file} and {h5_file}")
        return df



# -----------------------------
# Example usage
# -----------------------------
if __name__ == "__main__":
    processor = SafeProcessor()

    # List of local SAFE folder paths
    safe_folders = [
        "downloads/S1C_IW_GRDH_1SDV_20250904T160801_20250904T160826_003977_007E9B_80D4.SAFE",
        "downloads/S1C_IW_GRDH_1SDV_20250903T042048_20250903T042113_003955_007DFD_0404.SAFE"
    ]

    df = processor.process_safe_folders(safe_folders, output_prefix="bucharest_flood")
    print(df)
