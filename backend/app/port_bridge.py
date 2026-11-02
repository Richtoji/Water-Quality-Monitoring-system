"""
Port bridge for Zoho Catalyst AppSail.
Ensures both port 8080 and port 9000 are always actively listening and responding,
guaranteeing compatibility regardless of whether AppSail probes 8080 or 9000.
"""

import socket
import threading
import logging

logger = logging.getLogger("aquasense.port_bridge")

def _pipe(source, destination):
    try:
        while True:
            data = source.recv(4096)
            if not data:
                break
            destination.sendall(data)
    except Exception:
        pass
    finally:
        try:
            source.close()
        except Exception:
            pass
        try:
            destination.close()
        except Exception:
            pass

def _handle_connection(client_sock, target_port):
    try:
        backend_sock = socket.create_connection(("127.0.0.1", target_port), timeout=5)
        t1 = threading.Thread(target=_pipe, args=(client_sock, backend_sock), daemon=True)
        t2 = threading.Thread(target=_pipe, args=(backend_sock, client_sock), daemon=True)
        t1.start()
        t2.start()
    except Exception as e:
        logger.debug(f"Bridge forward failed to port {target_port}: {e}")
        try:
            client_sock.close()
        except Exception:
            pass

def start_bridge(bridge_port: int, target_port: int):
    """Listens on bridge_port and proxies all TCP traffic to target_port."""
    def _listen():
        try:
            server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            server.bind(("0.0.0.0", bridge_port))
            server.listen(128)
            logger.info(f"Port bridge active: 0.0.0.0:{bridge_port} -> 127.0.0.1:{target_port}")
            while True:
                client, _ = server.accept()
                threading.Thread(target=_handle_connection, args=(client, target_port), daemon=True).start()
        except Exception as e:
            logger.warning(f"Could not bind bridge on port {bridge_port} ({e})")

    thread = threading.Thread(target=_listen, daemon=True)
    thread.start()
