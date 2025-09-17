FROM python:3.11-slim

WORKDIR /app


RUN pip install --no-cache-dir flask requests


COPY . /app

ENV DL_API_PORT=8010
EXPOSE 8010

CMD ["python", "api.py"]
