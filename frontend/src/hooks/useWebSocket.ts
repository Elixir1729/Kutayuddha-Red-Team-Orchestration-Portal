import { useEffect, useCallback, useRef, useState } from 'react';
import { wsManager } from '../services/websocket';
import { WebSocketEvent } from '../types';

export function useWebSocket(onEvent?: (event: WebSocketEvent) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    wsManager.connect();

    const checkConnection = setInterval(() => {
      setIsConnected(wsManager.isConnected);
    }, 1000);

    const unsubscribe = wsManager.subscribe((event) => {
      callbackRef.current?.(event);
    });

    return () => {
      clearInterval(checkConnection);
      unsubscribe();
    };
  }, []);

  const send = useCallback((data: any) => {
    wsManager.send(data);
  }, []);

  return { isConnected, send };
}

export default useWebSocket;
