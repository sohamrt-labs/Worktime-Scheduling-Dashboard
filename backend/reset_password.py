# Copyright 2026 Soham Raut
# SPDX-License-Identifier: Apache-2.0

"""Set a new password for a user from the command line.

For the server operator, for example when a user is locked out and email is not set up yet.
Usage:  python reset_password.py USERNAME
"""
import getpass
import sys

from app import models
from app.database import SessionLocal
from app.security import hash_password


def main():
    if len(sys.argv) != 2:
        sys.exit("Usage: python reset_password.py USERNAME")
    password = getpass.getpass("New password (at least 8 characters): ")
    if len(password) < 8:
        sys.exit("The password must be at least 8 characters.")
    if password != getpass.getpass("Repeat the new password: "):
        sys.exit("The two passwords do not match.")
    with SessionLocal() as db:
        user = db.query(models.User).filter(models.User.username == sys.argv[1]).first()
        if user is None:
            sys.exit(f"There is no user named '{sys.argv[1]}'.")
        user.password_hash = hash_password(password)
        db.commit()
    print("Password updated. Any older logins for this user are now signed out.")


if __name__ == "__main__":
    main()
