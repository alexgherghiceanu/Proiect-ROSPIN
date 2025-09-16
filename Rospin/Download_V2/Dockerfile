FROM python:3.11-slim

WORKDIR /app

# dependențe minime; adaugă ce folosește main.py (ex: sentinelsat, shapely, requests, scikit-learn)
RUN pip install --no-cache-dir flask requests

# copiem doar Download_V2 (evităm Api_stuf ca să nu mai pice pe rasterio)
COPY . /app

ENV DL_API_PORT=8010
EXPOSE 8010

CMD ["python", "api.py"]
