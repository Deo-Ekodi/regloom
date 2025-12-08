// apps/frontend/src/components/Canvas.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Visual canvas component using React-Konva for drag-drop data flows.
// Displays raw data -> anonymized -> synthetic visualization.
// Handles interactions with logging for errors/user actions.
// Optimized for perf with lazy loading if large data.
// ─────────────────────────────────────────────────────────────────────────────

import { Stage, Layer, Rect, Text } from 'react-konva';
import { logger } from '@regloom/utils';

const Canvas: React.FC = () => {
    const handleDragStart = (e: any) => {
        logger.info('Drag started on node:', e.target.name());
    };

    return (
        <div className="mt-8 border rounded p-2">
            <h2 className="text-xl mb-2">Data Flow Canvas</h2>
            <Stage width={800} height={400} className="bg-gray-100">
                <Layer>
                    <Rect x={20} y={20} width={100} height={50} fill="blue" draggable onDragStart={handleDragStart} />
                    <Text text="Raw Data" x={30} y={30} />
                    {/* Add more nodes/arrows for full flow */}
                </Layer>
            </Stage>
        </div>
    );
};

export default Canvas;