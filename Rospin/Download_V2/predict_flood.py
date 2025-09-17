# predict_flood.py
import os
import re
import warnings
from typing import List, Sequence, Optional

import numpy as np
import pandas as pd

try:
    import joblib
except Exception:
    joblib = None
import pickle


ID_COLS_DEFAULT = ["safe_name", "year", "lat", "lon"]

BASE_FEATURES: List[str] = [
    "single_NDVI_mean","single_NDVI_std","single_NDVI_min","single_NDVI_max",
    "single_NDWI_mean","single_NDWI_std","single_NDWI_min","single_NDWI_max",
    "single_NDMI_mean","single_NDMI_std","single_NDMI_min","single_NDMI_max",
    "single_VV_Band_mean","single_VV_Band_std","single_VV_Band_min","single_VV_Band_max",
    "single_VH_Band_mean","single_VH_Band_std","single_VH_Band_min","single_VH_Band_max",
    "single_Water_Percentage_mean","single_Water_Percentage_std","single_Water_Percentage_min","single_Water_Percentage_max",
    "single_Water_Distance_mean","single_Water_Distance_std","single_Water_Distance_min","single_Water_Distance_max",
    "single_Dry_Percentage_mean","single_Dry_Percentage_std","single_Dry_Percentage_min","single_Dry_Percentage_max",
    "single_Drought_Mask_mean","single_Drought_Mask_std","single_Drought_Mask_min","single_Drought_Mask_max",
    "single_SAR_Urban_Mask_mean","single_SAR_Urban_Mask_std","single_SAR_Urban_Mask_min","single_SAR_Urban_Mask_max",
    "lat_rounded","lon_rounded",
   
]

DERIVED_RULES = {
    "ndvi_range": ("single_NDVI_max", "single_NDVI_min"),
    "ndwi_range": ("single_NDWI_max", "single_NDWI_min"),
    #  "ndmi_range": ("single_NDMI_max","single_NDMI_min"),
    #                     "vv_range": ("single_VV_Band_max","single_VV_Band_min"), etc.
}


def load_pickle(path: str):
    if joblib is not None:
        try:
            return joblib.load(path)
        except Exception:
            pass
    with open(path, "rb") as f:
        return pickle.load(f)


def _get_model_feature_names(model, df_cols: Sequence[str]) -> List[str]:
    # 1) sklearn estimators/pipelines
    if hasattr(model, "feature_names_in_"):
        return list(model.feature_names_in_)
    if hasattr(model, "named_steps"):
        for step in reversed(list(getattr(model, "named_steps").values())):
            if hasattr(step, "feature_names_in_"):
                return list(step.feature_names_in_)

    # 2) xgboost scikit wrapper
    if hasattr(model, "get_booster"):
        try:
            booster = model.get_booster()
            if hasattr(booster, "feature_names") and booster.feature_names:
                return list(booster.feature_names)
        except Exception:
            pass

    # 3) xgboost Booster pur
    if hasattr(model, "feature_names") and model.feature_names:
        return list(model.feature_names)

  
    return [c for c in BASE_FEATURES if c in df_cols]


def _ensure_derived(df: pd.DataFrame, require_cols: Sequence[str]) -> pd.DataFrame:
    df = df.copy()

    for derived, (a, b) in DERIVED_RULES.items():
        if derived in require_cols or derived in getattr(df, "columns", []):
            if a in df.columns and b in df.columns:
                df[derived] = df[a] - df[b]
            else:
                df[derived] = 0.0
        else:
  
            if a in df.columns and b in df.columns and derived not in df.columns:
                df[derived] = df[a] - df[b]
    return df


def _build_X(df: pd.DataFrame, expected: Sequence[str]) -> pd.DataFrame:
    X = pd.DataFrame(index=df.index)
    for col in expected:
        X[col] = pd.to_numeric(df[col], errors="coerce") if col in df.columns else 0.0
    X = X.replace([np.inf, -np.inf], np.nan).fillna(0.0)
    return X[expected]


def _parse_expected_from_xgb_error(msg: str) -> Optional[List[str]]:
    """
    În unele versiuni, mesajul are forma:
    'feature_names mismatch: [input_cols] [model_cols] expected fA, fB in input data'
    Încercăm să extragem lista după 'expected ' și înainte de ' in input data'.
    """
    m = re.search(r"expected (.+?) in input data", msg)
    if not m:
        return None
    raw = m.group(1)

    names = [t.strip().strip("'\"") for t in raw.split(",")]

    names = [n for n in names if n]
    return names or None


def predict_flood(
    csv_features_path: str = "bucharest_flood.csv",
    model_path: str = "flood_model.pkl",
    scaler_path: Optional[str] = None,
    out_csv: str = "flood_risk.csv",
    id_cols: Sequence[str] = tuple(ID_COLS_DEFAULT),
) -> pd.DataFrame:
    if not os.path.exists(csv_features_path):
        raise FileNotFoundError(f"Nu găsesc {csv_features_path}.")
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Nu găsesc modelul: {model_path}")

    df = pd.read_csv(csv_features_path)
    model = load_pickle(model_path)


    model_feats = _get_model_feature_names(model, df.columns)

  
    df = _ensure_derived(df, model_feats)

  
    expected = [c for c in model_feats if c in df.columns]
    if not expected:
      
        expected = [c for c in BASE_FEATURES + list(DERIVED_RULES.keys()) if c in df.columns]
    X = _build_X(df, expected)


    if scaler_path:
        if os.path.exists(scaler_path):
            scaler = load_pickle(scaler_path)
            if hasattr(scaler, "transform"):
                X = pd.DataFrame(scaler.transform(X), index=X.index, columns=expected)
            else:
                warnings.warn("Scaler încărcat nu are .transform; ignor.")
        else:
            warnings.warn(f"Scaler path dat dar nu există: {scaler_path} — continui fără scaler.")


    def _make_out(prob, lab):
        out = pd.DataFrame({"prob_flood": prob, "label": lab})
        for c in id_cols:
            if c in df.columns:
                out[c] = df[c]
        cols = [c for c in (*id_cols, "prob_flood", "label") if c in out.columns]
        return out[cols + [c for c in out.columns if c not in cols]]

    try:
        if hasattr(model, "predict_proba"):
            proba = model.predict_proba(X)[:, 1]
            label = (proba >= 0.5).astype(int)
            out = _make_out(proba, label)
            out.to_csv(out_csv, index=False)
            print(f"✅ Predicții scrise în: {out_csv}")
            return out
        elif hasattr(model, "decision_function"):
            z = model.decision_function(X)
            proba = 1.0 / (1.0 + np.exp(-z))
            label = (proba >= 0.5).astype(int)
            out = _make_out(proba, label)
            out.to_csv(out_csv, index=False)
            print(f"✅ Predicții scrise în: {out_csv}")
            return out
        else:
   
            try:
                import xgboost as xgb
                dm = xgb.DMatrix(X.values, feature_names=list(X.columns))
                proba = np.asarray(model.predict(dm)).reshape(-1)
                label = (proba >= 0.5).astype(int)
                out = _make_out(proba, label)
                out.to_csv(out_csv, index=False)
                print(f"✅ Predicții scrise în: {out_csv}")
                return out
            except Exception:
                pred = model.predict(X)
                label = np.asarray(pred).reshape(-1)
                out = _make_out(None, label)
                out.to_csv(out_csv, index=False)
                print(f"✅ Predicții scrise în: {out_csv}")
                return out

    except Exception as e:
    
        names_from_err = _parse_expected_from_xgb_error(str(e))
        if names_from_err:
      
            df = _ensure_derived(df, names_from_err)
          
            strict = [c for c in names_from_err if c in df.columns]
            X2 = _build_X(df, strict)
            try:
         
                if hasattr(model, "predict_proba"):
                    proba = model.predict_proba(X2, validate_features=False)[:, 1]
                    label = (proba >= 0.5).astype(int)
                else:
                    import xgboost as xgb
                    dm = xgb.DMatrix(X2.values, feature_names=list(X2.columns))
                    proba = np.asarray(model.get_booster().predict(dm, validate_features=False)).reshape(-1)
                    label = (proba >= 0.5).astype(int)
                out = _make_out(proba, label)
                out.to_csv(out_csv, index=False)
                print(f"✅ Predicții scrise în: {out_csv}")
                return out
            except Exception as e2:
                raise RuntimeError(
                    f"Eșec la retry cu schema din eroare: {e2}\n"
                    f"Retry features: {strict}\n"
                )

        raise RuntimeError(
            f"Eșec la predict: {e}\n"
            f"Expected (model): {model_feats}\n"
            f"Input cols      : {list(X.columns)}"
        )
