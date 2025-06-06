import io from 'socket.io-client';

export type ConnectionStatus = 
  | 'Connected'
  | 'Disconnected'
  | 'Error'
  | 'Reconnecting...'
  | 'Reconnection Error'
  | 'Reconnection Failed';

interface SocketMessage {
    type: string;
    updates?: Array<{
        npcId: string;
        currentHexCoord: string;
    }>;
}

interface SocketManager {
    socket: any;
    connectionStatus: string;
}

interface SocketManagerProps {
    url: string;
    onMessage?: (data: SocketMessage) => void;
}

let socketManagerInstance: SocketManager | null = null;

export function getSocketManager({ url, onMessage }: SocketManagerProps): SocketManager {
    if (socketManagerInstance) {
        return socketManagerInstance;
    }

    const socket = io(url, {
        transports: ['websocket', 'polling'],
        timeout: 20000,
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5
    });

    let connectionStatus: 'Connected' | 'Disconnected' | 'Connecting' | 'Reconnecting' | 'Reconnection Failed' = 'Connecting';

    socket.on('connect', () => {
        connectionStatus = 'Connected';
        console.log('Socket connected');
    });

    socket.on('disconnect', (reason: string) => {
        connectionStatus = 'Disconnected';
        console.log('Socket disconnected:', reason);
    });

    socket.on('connect_error', (error: Error) => {
        console.error('Socket connection error:', error);
    });

    socket.on('reconnect', (attemptNumber: number) => {
        connectionStatus = 'Connected';
        console.log('Socket reconnected after', attemptNumber, 'attempts');
    });

    socket.on('reconnect_attempt', (attemptNumber: number) => {
        connectionStatus = 'Reconnecting';
        console.log('Socket reconnection attempt:', attemptNumber);
    });

    socket.on('reconnect_error', (error: Error) => {
        console.error('Socket reconnection error:', error);
    });

    socket.on('reconnect_failed', () => {
        connectionStatus = 'Reconnection Failed';
        console.error('Socket reconnection failed');
    });

    if (onMessage) {
        socket.on('message', (data: SocketMessage) => {
            onMessage(data);
        });
    }

    socketManagerInstance = {
        socket,
        connectionStatus
    };

    return socketManagerInstance;
}

export function cleanupSocketManager() {
    if (socketManagerInstance?.socket) {
        socketManagerInstance.socket.disconnect();
        socketManagerInstance = null;
    }
} 