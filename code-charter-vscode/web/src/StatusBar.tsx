import React from 'react';

interface StatusBarProps {
    statusMessage: string;
}
export const StatusBar: React.FC<StatusBarProps> = ({ statusMessage }) => {
    return (
        <footer className="fixed bottom-0 left-0 w-full p-2 bg-gray-800 text-white text-center">
            {statusMessage}
        </footer>
    );
};
