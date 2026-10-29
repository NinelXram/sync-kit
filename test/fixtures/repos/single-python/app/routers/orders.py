from fastapi import APIRouter

from app.schemas.order import Order

router = APIRouter(prefix="/orders")


@router.get("/{order_id}")
def get_order(order_id: str) -> Order:
    return Order(id=order_id, total=0)
