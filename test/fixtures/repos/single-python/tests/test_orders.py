from app.schemas.order import Order


def test_order():
    assert Order(id="1", total=0).total == 0
