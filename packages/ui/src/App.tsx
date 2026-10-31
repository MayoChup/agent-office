import React from 'react';
import { ChatPanel } from './components/ChatPanel';
import { TaskBoard } from './components/TaskBoard';
import { LayoutEditor } from './components/LayoutEditor';
import { SystemLog } from './components/SystemLog';
import { HighlightsFeed } from './components/HighlightsFeed';
import { RelationshipGraph } from './components/RelationshipGraph';
import { UsageBadge } from './components/UsageBadge';

export function App() {
    return (
        <>
            <UsageBadge />
            <ChatPanel />
            <TaskBoard />
            <LayoutEditor />
            <SystemLog />
            <RelationshipGraph />
            <HighlightsFeed />
        </>
    );
}
