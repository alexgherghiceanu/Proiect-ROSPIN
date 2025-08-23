import os
import rasterio
import numpy as np
import rasterio.features
from shapely.geometry import shape, MultiPolygon

def find_measurement_tiff(safe_dir):
    """
    Recursively find the first measurement GeoTIFF in a Sentinel-1 .SAFE folder.
    """
    for root, dirs, files in os.walk(safe_dir):
        if 'measurement' in dirs:
            measurement_dir = os.path.join(root, 'measurement')
            for f in os.listdir(measurement_dir):
                if f.endswith('.tif') or f.endswith('.tiff'):
                    return os.path.join(measurement_dir, f)
    raise FileNotFoundError(f"No measurement TIFF found in SAFE folder: {safe_dir}")

def get_sentinel1_georef(safe_path):
    if os.path.isdir(safe_path):
        tiff_path = find_measurement_tiff(safe_path)
    else:
        tiff_path = safe_path
    with rasterio.open(tiff_path) as src:
        arr = src.read(1).astype("float32")
        return arr, src.transform, src.crs

def detect_flood(pre_safe, post_safe, output_mask):
    """
    Detects flooded areas between two Sentinel-1 .SAFE folders
    and writes a flood mask GeoTIFF.
    Returns: output_mask path, flooded percentage, flooded polygons WKT.
    """
    pre_arr, pre_transform, pre_crs = get_sentinel1_georef(pre_safe)
    post_arr, post_transform, post_crs = get_sentinel1_georef(post_safe)

    # Difference and threshold
    diff = pre_arr - post_arr
    threshold = np.percentile(diff, 0)  # adjust as needed
    flood_mask = (diff > threshold).astype("uint8")

    # Prepare metadata for output mask
    meta = {
        "driver": "GTiff",
        "dtype": "uint8",
        "count": 1,
        "height": flood_mask.shape[0],
        "width": flood_mask.shape[1],
        "transform": post_transform,
        "crs": post_crs
    }

    # Write flood mask
    with rasterio.open(output_mask, "w", **meta) as dst:
        dst.write(flood_mask, 1)

    # Extract polygons of flooded areas
    flooded_shapes = [
        shape(geom)
        for geom, value in rasterio.features.shapes(flood_mask, mask=flood_mask, transform=post_transform)
        if value == 1
    ]
    flooded_geom = MultiPolygon(flooded_shapes).wkt if flooded_shapes else None

    # Percentage flooded
    flooded_pct = 100 * flood_mask.sum() / flood_mask.size

    return output_mask, flooded_pct, flooded_geom
