import time
import psycopg2
import psycopg2.extras
from contextlib import contextmanager
from typing import Generator
from app.config import settings

def _connect_with_retry(url: str, max_retries: int = 5, base_delay: float = 1.0):
    """
    Establish a DB connection with exponential backoff retry.
    Handles transient cloud DB disconnects (e.g. Nhost connection drops).
    """
    last_err = None
    for attempt in range(1, max_retries + 1):
        try:
            return psycopg2.connect(url)
        except psycopg2.OperationalError as e:
            last_err = e
            if attempt < max_retries:
                delay = base_delay * (2 ** (attempt - 1))  # 1s, 2s, 4s, 8s
                time.sleep(delay)
    raise last_err

@contextmanager
def get_db_cursor() -> Generator[psycopg2.extras.RealDictCursor, None, None]:
    """
    Context manager providing a PostgreSQL connection and dictionary cursor.
    Handles commit on success and rollback on error.
    Retries connection on transient OperationalErrors.
    """
    conn = _connect_with_retry(settings.DATABASE_URL)
    conn.autocommit = False
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        yield cursor
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cursor.close()
        conn.close()
