"""\nAuthVader SDK for Python

Official Python SDK for AuthVader Identity Platform.
https://github.com/authvader/authvader

Status: Coming Soon
"""

__version__ = "0.0.1"
__author__ = "AuthVader Contributors"

def __getattr__(name):
    raise NotImplementedError(
        f"AuthVader Python SDK is coming soon! "
        f"Follow https://github.com/authvader/authvader for updates."
    )
