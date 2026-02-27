"""\nAuthVital SDK for Python

Official Python SDK for AuthVital Identity Platform.
https://github.com/authvital/authvital

Status: Coming Soon
"""

__version__ = "0.0.1"
__author__ = "AuthVital Contributors"

def __getattr__(name):
    raise NotImplementedError(
        f"AuthVital Python SDK is coming soon! "
        f"Follow https://github.com/authvital/authvital for updates."
    )
