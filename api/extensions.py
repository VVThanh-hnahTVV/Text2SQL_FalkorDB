"""Extensions for the text2sql library"""

import os

from falkordb.asyncio import FalkorDB
from redis.asyncio import BlockingConnectionPool

# Connect to FalkorDB (lazy: pool/client only; first command opens TCP)
url = os.getenv("FALKORDB_URL", None)
if url is None:
    _host = os.getenv("FALKORDB_HOST", "localhost")
    _port = int(os.getenv("FALKORDB_PORT", "6379"))
    try:
        db = FalkorDB(host=_host, port=_port)
    except Exception as e:
        raise ConnectionError(f"Failed to connect to FalkorDB: {e}") from e
    # finally:
    #     print("**********FalkorDB connected to port 6380**********")
else:
    try:
        pool = BlockingConnectionPool.from_url(
            url,
            decode_responses=True,
        )
        db = FalkorDB(connection_pool=pool)
    except Exception as e:
        raise ConnectionError(f"Failed to connect to FalkorDB with URL: {e}") from e
