import os
import xml.etree.ElementTree as ET
from typing import Tuple, Optional, Dict

import numpy as np
import pandas as pd
import rasterio
from rasterio.warp import transform
from rasterio.enums import Resampling

# optional distance transform (only used if installed)
try:
    from scipy.ndimage import distance_transform_edt
    _HAS_SCIPY = True
except Exception:
    _HAS_SCIPY = False


class SafeProcessor:
    def __init__(self, download_dir="downloads", max_pixels: int = 2_000_000):
        """
        :param max_pixels: maximum number of pixels to read per band in-memory.
                           if a band has more pixels than this, it will be downsampled
                           (using rasterio.read(..., out_shape=...)) to approximately max_pixels.
        """
        self.download_dir = download_dir
        self.max_pixels = int(max_pixels)
        os.makedirs(download_dir, exist_ok=True)

    # ------------------------
    # Utility helpers
    # ------------------------
    @staticmethod
    def _band_stats(arr: np.ndarray) -> Tuple[float, float, float, float]:
        """Return mean, std, min, max ignoring NaNs. Returns NaN for empty arrays."""
        if arr is None:
            return (np.nan, np.nan, np.nan, np.nan)
        # flatten and ignore NaN
        try:
            a = arr.astype(float)
            a = a[np.isfinite(a)]
            if a.size == 0:
                return (np.nan, np.nan, np.nan, np.nan)
            return (float(np.mean(a)), float(np.std(a)), float(np.min(a)), float(np.max(a)))
        except Exception:
            return (np.nan, np.nan, np.nan, np.nan)

    def _parse_annotation_latlon(self, safe_dir: str) -> Tuple[Optional[float], Optional[float]]:
        """
        Robustly parse annotation XML(s) and gather geolocationGridPoint lat/lon values.
        Handles namespaced XML by checking tag local-names.
        """
        annot_dir = os.path.join(safe_dir, "annotation")
        if not os.path.isdir(annot_dir):
            return (None, None)

        lat_list = []
        lon_list = []

        for fn in os.listdir(annot_dir):
            if not fn.lower().endswith(".xml"):
                continue
            p = os.path.join(annot_dir, fn)
            try:
                tree = ET.parse(p)
                root = tree.getroot()
            except Exception:
                # skip malformed xml
                continue

            # iterate all elements and find any element with local-name 'geolocationGridPoint'
            for gp in root.iter():
                tag_local = gp.tag.split("}")[-1] if "}" in gp.tag else gp.tag
                if tag_local == "geolocationGridPoint":
                    lat_el = None
                    lon_el = None
                    # find children by local-name
                    for child in gp:
                        child_local = child.tag.split("}")[-1] if "}" in child.tag else child.tag
                        if child_local == "latitude":
                            lat_el = child
                        elif child_local == "longitude":
                            lon_el = child
                    if lat_el is not None and lon_el is not None:
                        try:
                            lat_list.append(float(lat_el.text))
                            lon_list.append(float(lon_el.text))
                        except Exception:
                            continue

        if len(lat_list) == 0 or len(lon_list) == 0:
            return (None, None)

        return (float(np.mean(lat_list)), float(np.mean(lon_list)))

    def _read_band_limited(self, path: str) -> Tuple[Optional[np.ndarray], Optional[dict]]:
        """
        Read band into memory, but limit memory usage by downsampling when very large.

        Returns (array (2D float), profile) where array is downsampled if needed.
        """
        try:
            with rasterio.open(path) as src:
                h, w = src.height, src.width
                total = int(h) * int(w)
                if total <= self.max_pixels:
                    arr = src.read(1).astype(float)
                    profile = src.profile
                    return arr, profile
                else:
                    # compute scaling factor to approximate max_pixels
                    scale = (self.max_pixels / float(total)) ** 0.5
                    new_h = max(1, int(h * scale))
                    new_w = max(1, int(w * scale))
                    out_shape = (1, new_h, new_w)
                    # use bilinear resampling for optical; okay for stats
                    arr = src.read(1, out_shape=out_shape, resampling=Resampling.bilinear).astype(float)
                    profile = src.profile.copy()
                    profile.update({"height": new_h, "width": new_w, "transform": src.transform})  # transform is approximate
                    return arr, profile
        except Exception as e:
            print(f"⚠️ Failed to read {path}: {e}")
            return None, None

    # ------------------------
    # Sentinel-1 processing
    # ------------------------
    def _compute_s1_stats(self, vv_path: str, vh_path: str, safe_dir: str) -> Dict:
        """
        Read VV/VH with memory limit, normalize each band to [0,1], compute stats.
        Returns dict with stats and a downsampled normalized array for mask detection (small).
        """
        # read limited
        vv_arr, vv_prof = self._read_band_limited(vv_path)
        vh_arr, vh_prof = self._read_band_limited(vh_path)

        if vv_arr is None or vh_arr is None:
            raise RuntimeError("Failed reading S1 bands")

        # mask non-finite
        vv_arr = np.where(np.isfinite(vv_arr), vv_arr, np.nan)
        vh_arr = np.where(np.isfinite(vh_arr), vh_arr, np.nan)

        def normalize_0_1(a):
            if a is None:
                return None
            amin = np.nanmin(a)
            amax = np.nanmax(a)
            if np.isnan(amin) or np.isnan(amax) or amax == amin:
                # return array of NaNs so stats become NaN
                return np.full_like(a, np.nan, dtype=float)
            return (a - amin) / (amax - amin)

        vv_n = normalize_0_1(vv_arr)
        vh_n = normalize_0_1(vh_arr)

        vv_stats = self._band_stats(vv_n)
        vh_stats = self._band_stats(vh_n)

        # compute center lat/lon: prefer raster transform if crs present; else parse annotation
        lat = lon = None
        try:
            with rasterio.open(vv_path) as src:
                row = src.height // 2
                col = src.width // 2
                x, y = rasterio.transform.xy(src.transform, row, col)
                if src.crs is not None:
                    try:
                        lon_arr, lat_arr = transform(src.crs, "EPSG:4326", [x], [y])
                        lon = float(lon_arr[0])
                        lat = float(lat_arr[0])
                    except Exception:
                        lat = lon = None
                else:
                    lat = lon = None
        except Exception:
            lat = lon = None

        if lat is None or lon is None:
            lat, lon = self._parse_annotation_latlon(safe_dir)

        # remove big arrays from memory by keeping only small normalized arrays
        # (we returned downsampled arrays from _read_band_limited already)
        return {
            "vv_stats": vv_stats,
            "vh_stats": vh_stats,
            "vv_norm_small": vv_n,  # small/downsampled array for mask detection
            "vh_norm_small": vh_n,
            "lat": lat,
            "lon": lon,
        }

    # ------------------------
    # Sentinel-2 processing (optional)
    # ------------------------
    def _find_s2_band_files(self, s2_safe_dir: str) -> Dict[str, Optional[str]]:
        bands = {"B03": None, "B04": None, "B08": None, "B11": None}
        for root, _, files in os.walk(s2_safe_dir):
            for f in files:
                fn = f.upper()
                for b in bands:
                    if b in fn and bands[b] is None:
                        bands[b] = os.path.join(root, f)
        return bands

    def _compute_s2_indices_stats(self, s2_safe_dir: str) -> Optional[Dict]:
        bands = self._find_s2_band_files(s2_safe_dir)
        if not bands or any(bands[b] is None for b in ["B04", "B03", "B08", "B11"]):
            return None

        # read with limiting
        red, _ = self._read_band_limited(bands["B04"])
        green, _ = self._read_band_limited(bands["B03"])
        nir, profile = self._read_band_limited(bands["B08"])
        swir, _ = self._read_band_limited(bands["B11"])

        if any(x is None for x in [red, green, nir, swir]):
            return None

        # safe index calc with division handling
        def safe_index(a, b):
            with np.errstate(divide="ignore", invalid="ignore"):
                res = (a - b) / (a + b)
                res[~np.isfinite(res)] = np.nan
                return res

        ndvi = safe_index(nir, red)
        ndwi = safe_index(green, nir)
        ndmi = safe_index(nir, swir)

        return {
            "ndvi": ndvi,
            "ndwi": ndwi,
            "ndmi": ndmi,
            "ndvi_stats": self._band_stats(ndvi),
            "ndwi_stats": self._band_stats(ndwi),
            "ndmi_stats": self._band_stats(ndmi),
            "s2_profile": profile,
        }

    # ------------------------
    # High-level product processing
    # ------------------------
    def process_safe_product(self, safe_dir: str, sentinel2_safe_dir: Optional[str] = None) -> Dict:
        meas_dir = os.path.join(safe_dir, "measurement")
        if not os.path.isdir(meas_dir):
            raise FileNotFoundError(f"No measurement dir in {safe_dir}")

        vv_file = vh_file = None
        for fn in os.listdir(meas_dir):
            if not fn.lower().endswith((".tif", ".tiff", ".img", ".tiff.aux.xml")):
                continue
            name = fn.upper()
            if "VV" in name and vv_file is None:
                vv_file = os.path.join(meas_dir, fn)
            elif "VH" in name and vh_file is None:
                vh_file = os.path.join(meas_dir, fn)

        if not vv_file or not vh_file:
            raise FileNotFoundError("Missing VV/VH TIFFs in measurement directory")

        s1_res = self._compute_s1_stats(vv_file, vh_file, safe_dir)
        s2_res = None
        if sentinel2_safe_dir:
            try:
                s2_res = self._compute_s2_indices_stats(sentinel2_safe_dir)
            except Exception as e:
                print(f"⚠️ S2 processing failed for {sentinel2_safe_dir}: {e}")
                s2_res = None

        # water mask from NDWI > 0
        if s2_res is not None:
            ndwi = s2_res["ndwi"]
            water_mask = (ndwi > 0).astype(float)
            water_stats = self._band_stats(water_mask)
        else:
            water_mask = None
            water_stats = (np.nan, np.nan, np.nan, np.nan)

        # dry mask from NDVI < 0.2
        if s2_res is not None:
            ndvi = s2_res["ndvi"]
            dry_mask = (ndvi < 0.2).astype(float)
            dry_stats = self._band_stats(dry_mask)
        else:
            dry_mask = None
            dry_stats = (np.nan, np.nan, np.nan, np.nan)

        # drought mask from NDMI < 0.0
        if s2_res is not None:
            ndmi = s2_res["ndmi"]
            drought_mask = (ndmi < 0.0).astype(float)
            drought_stats = self._band_stats(drought_mask)
        else:
            drought_mask = None
            drought_stats = (np.nan, np.nan, np.nan, np.nan)

        # SAR urban mask using normalized downsampled VV (threshold tunable)
        vv_n_small = s1_res.get("vv_norm_small")
        if vv_n_small is not None:
            try:
                urban_mask = (vv_n_small > 0.75).astype(float)
                urban_stats = self._band_stats(urban_mask)
            except Exception:
                urban_mask = None
                urban_stats = (np.nan, np.nan, np.nan, np.nan)
        else:
            urban_mask = None
            urban_stats = (np.nan, np.nan, np.nan, np.nan)

        # water distance - only if scipy available and we have water_mask
        if _HAS_SCIPY and water_mask is not None:
            try:
                # distance_transform_edt expects boolean (non-zero = feature), we want distance to water pixels,
                # so invert: distance from non-water pixels to nearest water pixel.
                not_water = 1.0 - water_mask
                dist_pixels = distance_transform_edt(not_water)
                # approximate pixel size: try from profile (if available)
                prof = s2_res.get("s2_profile") if s2_res else None
                if prof and "transform" in prof:
                    px = abs(prof["transform"][0])
                else:
                    px = 1.0
                dist_m = dist_pixels * px
                water_distance_stats = self._band_stats(dist_m)
            except Exception:
                water_distance_stats = (np.nan, np.nan, np.nan, np.nan)
        else:
            water_distance_stats = (np.nan, np.nan, np.nan, np.nan)

        # ND stats (if s2 available)
        if s2_res is not None:
            ndvi_stats = s2_res["ndvi_stats"]
            ndwi_stats = s2_res["ndwi_stats"]
            ndmi_stats = s2_res["ndmi_stats"]
        else:
            ndvi_stats = ndwi_stats = ndmi_stats = (np.nan, np.nan, np.nan, np.nan)

        row = {
            "label": -1,
            "year": None,  # set by caller
            "lat": s1_res.get("lat"),
            "lon": s1_res.get("lon"),

            # NDVI
            "single_NDVI_mean": ndvi_stats[0],
            "single_NDVI_std": ndvi_stats[1],
            "single_NDVI_min": ndvi_stats[2],
            "single_NDVI_max": ndvi_stats[3],

            # NDWI
            "single_NDWI_mean": ndwi_stats[0],
            "single_NDWI_std": ndwi_stats[1],
            "single_NDWI_min": ndwi_stats[2],
            "single_NDWI_max": ndwi_stats[3],

            # NDMI
            "single_NDMI_mean": ndmi_stats[0],
            "single_NDMI_std": ndmi_stats[1],
            "single_NDMI_min": ndmi_stats[2],
            "single_NDMI_max": ndmi_stats[3],

            # VV
            "single_VV_Band_mean": s1_res["vv_stats"][0],
            "single_VV_Band_std": s1_res["vv_stats"][1],
            "single_VV_Band_min": s1_res["vv_stats"][2],
            "single_VV_Band_max": s1_res["vv_stats"][3],

            # VH
            "single_VH_Band_mean": s1_res["vh_stats"][0],
            "single_VH_Band_std": s1_res["vh_stats"][1],
            "single_VH_Band_min": s1_res["vh_stats"][2],
            "single_VH_Band_max": s1_res["vh_stats"][3],

            # water %
            "single_Water_Percentage_mean": water_stats[0],
            "single_Water_Percentage_std": water_stats[1],
            "single_Water_Percentage_min": water_stats[2],
            "single_Water_Percentage_max": water_stats[3],

            # water distance
            "single_Water_Distance_mean": water_distance_stats[0],
            "single_Water_Distance_std": water_distance_stats[1],
            "single_Water_Distance_min": water_distance_stats[2],
            "single_Water_Distance_max": water_distance_stats[3],

            # dry %
            "single_Dry_Percentage_mean": dry_stats[0],
            "single_Dry_Percentage_std": dry_stats[1],
            "single_Dry_Percentage_min": dry_stats[2],
            "single_Dry_Percentage_max": dry_stats[3],

            # drought mask
            "single_Drought_Mask_mean": drought_stats[0],
            "single_Drought_Mask_std": drought_stats[1],
            "single_Drought_Mask_min": drought_stats[2],
            "single_Drought_Mask_max": drought_stats[3],

            # SAR urban mask
            "single_SAR_Urban_Mask_mean": urban_stats[0],
            "single_SAR_Urban_Mask_std": urban_stats[1],
            "single_SAR_Urban_Mask_min": urban_stats[2],
            "single_SAR_Urban_Mask_max": urban_stats[3],

            "lat_rounded": round(s1_res.get("lat"), 3) if s1_res.get("lat") is not None else None,
            "lon_rounded": round(s1_res.get("lon"), 3) if s1_res.get("lon") is not None else None,
        }

        # explicitly delete big arrays (if any) to free memory
        for k in ("vv_norm_small", "vh_norm_small"):
            if k in s1_res:
                del s1_res[k]
        if s2_res:
            for k in ("ndvi", "ndwi", "ndmi"):
                if k in s2_res:
                    del s2_res[k]

        return row

    # ------------------------
    # Batch processing + CSV
    # ------------------------
    def extract_datetime_from_safe(self, safe_dir: str) -> Optional[pd.Timestamp]:
        basename = os.path.basename(safe_dir)
        parts = basename.split("_")
        if len(parts) >= 6:
            try:
                return pd.to_datetime(parts[4], format="%Y%m%dT%H%M%S")
            except Exception:
                return None
        return None

    def process_safe_folders(self, safe_folders: list, output_prefix="output", s2_mapping: dict = None) -> pd.DataFrame:
        rows = []
        for safe_dir in safe_folders:
            try:
                s2_dir = s2_mapping.get(safe_dir) if s2_mapping else None
                row = self.process_safe_product(safe_dir, sentinel2_safe_dir=s2_dir)
                dt = self.extract_datetime_from_safe(safe_dir)
                row["year"] = dt.year if dt is not None else None
                rows.append(row)
                print(f"Processed {safe_dir}")
            except Exception as e:
                print(f"Failed {safe_dir}: {e}")
                # append empty row of NaNs (keeps consistent columns)
                empty = {c: np.nan for c in [
                    "label", "year", "lat", "lon",
                    "single_NDVI_mean", "single_NDVI_std", "single_NDVI_min", "single_NDVI_max",
                    "single_NDWI_mean", "single_NDWI_std", "single_NDWI_min", "single_NDWI_max",
                    "single_NDMI_mean", "single_NDMI_std", "single_NDMI_min", "single_NDMI_max",
                    "single_VV_Band_mean", "single_VV_Band_std", "single_VV_Band_min", "single_VV_Band_max",
                    "single_VH_Band_mean", "single_VH_Band_std", "single_VH_Band_min", "single_VH_Band_max",
                    "single_Water_Percentage_mean", "single_Water_Percentage_std", "single_Water_Percentage_min", "single_Water_Percentage_max",
                    "single_Water_Distance_mean", "single_Water_Distance_std", "single_Water_Distance_min", "single_Water_Distance_max",
                    "single_Dry_Percentage_mean", "single_Dry_Percentage_std", "single_Dry_Percentage_min", "single_Dry_Percentage_max",
                    "single_Drought_Mask_mean", "single_Drought_Mask_std", "single_Drought_Mask_min", "single_Drought_Mask_max",
                    "single_SAR_Urban_Mask_mean", "single_SAR_Urban_Mask_std", "single_SAR_Urban_Mask_min", "single_SAR_Urban_Mask_max",
                    "lat_rounded", "lon_rounded"
                ]}
                dt = self.extract_datetime_from_safe(safe_dir)
                empty["year"] = dt.year if dt else np.nan
                empty["label"] = -1
                rows.append(empty)

        df = pd.DataFrame(rows)

        cols_order = [
            "label", "year", "lat", "lon",
            "single_NDVI_mean", "single_NDVI_std", "single_NDVI_min", "single_NDVI_max",
            "single_NDWI_mean", "single_NDWI_std", "single_NDWI_min", "single_NDWI_max",
            "single_NDMI_mean", "single_NDMI_std", "single_NDMI_min", "single_NDMI_max",
            "single_VV_Band_mean", "single_VV_Band_std", "single_VV_Band_min", "single_VV_Band_max",
            "single_VH_Band_mean", "single_VH_Band_std", "single_VH_Band_min", "single_VH_Band_max",
            "single_Water_Percentage_mean", "single_Water_Percentage_std", "single_Water_Percentage_min", "single_Water_Percentage_max",
            "single_Water_Distance_mean", "single_Water_Distance_std", "single_Water_Distance_min", "single_Water_Distance_max",
            "single_Dry_Percentage_mean", "single_Dry_Percentage_std", "single_Dry_Percentage_min", "single_Dry_Percentage_max",
            "single_Drought_Mask_mean", "single_Drought_Mask_std", "single_Drought_Mask_min", "single_Drought_Mask_max",
            "single_SAR_Urban_Mask_mean", "single_SAR_Urban_Mask_std", "single_SAR_Urban_Mask_min", "single_SAR_Urban_Mask_max",
            "lat_rounded", "lon_rounded"
        ]
        cols_order = [c for c in cols_order if c in df.columns]
        df = df[cols_order]

        csv_file = f"{output_prefix}.csv"
        df.to_csv(csv_file, index=False)
        print(f"Saved results to {csv_file}")
        return df


# -----------------------------
# Example usage
# -----------------------------
'''if __name__ == "__main__":
    processor = SafeProcessor(max_pixels=1_000_000)  # reduce this if process still OOMs
    s1_folders = [
        "downloads/S1C_IW_GRDH_1SDV_20250904T160801_20250904T160826_003977_007E9B_80D4.SAFE",
        "downloads/S1C_IW_GRDH_1SDV_20250903T042048_20250903T042113_003955_007DFD_0404.SAFE",
       # "downloads/S1A_IW_GRDH_1SDV_20230124T160923_20230124T160948_046928_05A0CA_E9E9.SAFE"
        "downloads/S1A_IW_GRDH_1SDV_20230116T043009_20230116T043034_046804_059C91_925E.SAFE"
    ]
    # optional mapping S1->S2
    s2_map = {
         "downloads/S1C_IW_GRDH_1SDV_20250904T160801_20250904T160826_003977_007E9B_80D4.SAFE": "downloads/S2A_MSIL2A_20250903T091041_N0511_R050_T35TMK_20250903T134304.SAFE",
         "downloads/S1A_IW_GRDH_1SDV_20230116T043009_20230116T043034_046804_059C91_925E.SAFE": "downloads/S2A_MSIL2A_20230306T090831_N0510_R050_T35TMK_20240820T071440.SAFE"
    }

    df = processor.process_safe_folders(s1_folders, output_prefix="bucharest_flood", s2_mapping=s2_map)
    print(df.head())
'''