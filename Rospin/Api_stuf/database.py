from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text
from sqlalchemy.orm import sessionmaker, declarative_base
from datetime import datetime

Base = declarative_base()

class FloodEvent(Base):
    __tablename__ = "flood_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    aoi_wkt = Column(Text, nullable=False)
    pre_product_id = Column(String, nullable=False)
    post_product_id = Column(String, nullable=False)
    pre_date = Column(DateTime, nullable=False)
    post_date = Column(DateTime, nullable=False)
    flood_mask_path = Column(String, nullable=False)
    flooded_pct = Column(Float, nullable=False)
    flood_geom = Column(Text)  
engine = create_engine("sqlite:///flood_risk.db")
Base.metadata.create_all(engine)
SessionLocal = sessionmaker(bind=engine)

def save_flood_result(aoi_wkt, pre_product, post_product, flood_mask_path, flooded_pct, flooded_geom):
    session = SessionLocal()
    event = FloodEvent(
        aoi_wkt=aoi_wkt,
        pre_product_id=pre_product["id"],
        post_product_id=post_product["id"],
        pre_date=datetime.fromisoformat(pre_product["properties"]["startDate"].replace("Z", "")),
        post_date=datetime.fromisoformat(post_product["properties"]["startDate"].replace("Z", "")),
        flood_mask_path=flood_mask_path,
        flooded_pct=flooded_pct,
        flood_geom=flooded_geom
    )
    session.add(event)
    session.commit()
    session.close()

def get_flood_events(aoi_filter=None, date_range=None):
    session = SessionLocal()
    query = session.query(FloodEvent)

    if aoi_filter:
        query = query.filter(FloodEvent.aoi_wkt == aoi_filter)

    if date_range:
        start, end = date_range
        query = query.filter(FloodEvent.post_date >= start, FloodEvent.post_date <= end)

    results = query.all()
    session.close()
    return results
