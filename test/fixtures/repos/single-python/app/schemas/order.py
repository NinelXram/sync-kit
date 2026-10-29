from pydantic import BaseModel


class Order(BaseModel):
    id: str
    total: int
