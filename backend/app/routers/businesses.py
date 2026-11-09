# Copyright 2026 Soham Raut
# SPDX-License-Identifier: Apache-2.0

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from .. import config
from ..database import get_db
from ..deps import get_current_user
from ..models import Business, User
from ..schemas import BusinessIn, BusinessOut

router = APIRouter(prefix="/api/businesses", tags=["businesses"])


def _mine(db: Session, user: User, business_id: int) -> Business:
    business = db.get(Business, business_id)
    if business is None or business.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Business not found")
    return business


@router.get("", response_model=list[BusinessOut])
def list_businesses(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Business).filter(Business.owner_id == user.id).order_by(Business.id).all()


@router.post("", response_model=BusinessOut, status_code=status.HTTP_201_CREATED)
def create_business(body: BusinessIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if db.query(Business).filter(Business.owner_id == user.id).count() >= config.MAX_BUSINESSES_PER_USER:
        raise HTTPException(status.HTTP_409_CONFLICT, f"You can have at most {config.MAX_BUSINESSES_PER_USER} businesses")
    business = Business(owner_id=user.id, **body.model_dump())
    db.add(business)
    db.commit()
    db.refresh(business)
    return business


@router.put("/{business_id}", response_model=BusinessOut)
def update_business(business_id: int, body: BusinessIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    business = _mine(db, user, business_id)
    business.name, business.industry = body.name, body.industry
    db.commit()
    db.refresh(business)
    return business


@router.delete("/{business_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_business(business_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    business = _mine(db, user, business_id)
    if db.query(Business).filter(Business.owner_id == user.id).count() <= 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You need at least one business")
    db.delete(business)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
