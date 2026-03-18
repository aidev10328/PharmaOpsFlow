'use client';

import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';

type Tool = 'draw' | 'rectangle' | 'arrow' | 'text' | 'highlight';

type DrawAction = {
  tool: Tool;
  color: string;
  lineWidth: number;
  points?: { x: number; y: number }[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  text?: string;
};

type Props = {
  imageUrl: string;
  onSave: (annotatedBlob: Blob) => void;
  onCancel: () => void;
};

export type ScreenshotAnnotatorRef = {
  save: () => void;
};

const COLORS = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#000000'];

const ScreenshotAnnotator = forwardRef<ScreenshotAnnotatorRef, Props>(({ imageUrl, onSave, onCancel }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const [tool, setTool] = useState<Tool>('draw');
  const [color, setColor] = useState('#EF4444');
  const [lineWidth, setLineWidth] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [actions, setActions] = useState<DrawAction[]>([]);
  const [currentAction, setCurrentAction] = useState<DrawAction | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [textInput, setTextInput] = useState('');
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);
  const [undoneActions, setUndoneActions] = useState<DrawAction[]>([]);

  // Focus text input when it appears
  useEffect(() => {
    if (textPos && textInputRef.current) {
      // Small delay to ensure the input is rendered and positioned
      setTimeout(() => textInputRef.current?.focus(), 50);
    }
  }, [textPos]);

  // Load image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImage(img);
      const canvas = canvasRef.current;
      if (canvas) {
        // Scale to fit within 800px width max
        const scale = Math.min(1, 800 / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
      }
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const getCanvasPoint = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    // Scale from CSS display size to canvas internal resolution
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  // Redraw everything
  const redraw = useCallback((ctx: CanvasRenderingContext2D, allActions: DrawAction[], current?: DrawAction | null) => {
    if (!image || !canvasRef.current) return;
    const canvas = canvasRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const toDraw = current ? [...allActions, current] : allActions;
    for (const action of toDraw) {
      ctx.strokeStyle = action.color;
      ctx.fillStyle = action.color;
      ctx.lineWidth = action.lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (action.tool === 'draw' && action.points && action.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(action.points[0].x, action.points[0].y);
        for (let i = 1; i < action.points.length; i++) {
          ctx.lineTo(action.points[i].x, action.points[i].y);
        }
        ctx.stroke();
      } else if (action.tool === 'highlight' && action.points && action.points.length > 1) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 20;
        ctx.beginPath();
        ctx.moveTo(action.points[0].x, action.points[0].y);
        for (let i = 1; i < action.points.length; i++) {
          ctx.lineTo(action.points[i].x, action.points[i].y);
        }
        ctx.stroke();
        ctx.restore();
      } else if (action.tool === 'rectangle' && action.start && action.end) {
        ctx.strokeRect(
          action.start.x, action.start.y,
          action.end.x - action.start.x,
          action.end.y - action.start.y,
        );
      } else if (action.tool === 'arrow' && action.start && action.end) {
        const dx = action.end.x - action.start.x;
        const dy = action.end.y - action.start.y;
        const angle = Math.atan2(dy, dx);
        const headLen = 15;

        ctx.beginPath();
        ctx.moveTo(action.start.x, action.start.y);
        ctx.lineTo(action.end.x, action.end.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(action.end.x, action.end.y);
        ctx.lineTo(
          action.end.x - headLen * Math.cos(angle - Math.PI / 6),
          action.end.y - headLen * Math.sin(angle - Math.PI / 6),
        );
        ctx.moveTo(action.end.x, action.end.y);
        ctx.lineTo(
          action.end.x - headLen * Math.cos(angle + Math.PI / 6),
          action.end.y - headLen * Math.sin(angle + Math.PI / 6),
        );
        ctx.stroke();
      } else if (action.tool === 'text' && action.start && action.text) {
        ctx.font = 'bold 16px Inter, sans-serif';
        ctx.fillStyle = action.color;

        // Background
        const metrics = ctx.measureText(action.text);
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(action.start.x - 2, action.start.y - 16, metrics.width + 4, 22);
        ctx.restore();

        ctx.fillStyle = action.color;
        ctx.fillText(action.text, action.start.x, action.start.y);
      }
    }
  }, [image]);

  // Redraw on actions change
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) redraw(ctx, actions);
  }, [actions, image, redraw]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e);

    if (tool === 'text') {
      setTextPos(point);
      return;
    }

    setIsDrawing(true);
    setUndoneActions([]);

    if (tool === 'draw' || tool === 'highlight') {
      setCurrentAction({ tool, color, lineWidth, points: [point] });
    } else {
      setCurrentAction({ tool, color, lineWidth, start: point, end: point });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentAction) return;
    const point = getCanvasPoint(e);

    const updated = { ...currentAction };
    if (updated.tool === 'draw' || updated.tool === 'highlight') {
      updated.points = [...(updated.points || []), point];
    } else {
      updated.end = point;
    }
    setCurrentAction(updated);

    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) redraw(ctx, actions, updated);
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentAction) return;
    setIsDrawing(false);
    setActions(prev => [...prev, currentAction]);
    setCurrentAction(null);
  };

  const handleTextSubmit = () => {
    if (!textPos || !textInput.trim()) {
      setTextPos(null);
      setTextInput('');
      return;
    }
    setActions(prev => [...prev, {
      tool: 'text',
      color,
      lineWidth,
      start: textPos,
      text: textInput,
    }]);
    setTextPos(null);
    setTextInput('');
    setUndoneActions([]);
  };

  const undo = () => {
    if (actions.length === 0) return;
    const last = actions[actions.length - 1];
    setActions(prev => prev.slice(0, -1));
    setUndoneActions(prev => [...prev, last]);
  };

  const redo = () => {
    if (undoneActions.length === 0) return;
    const last = undoneActions[undoneActions.length - 1];
    setUndoneActions(prev => prev.slice(0, -1));
    setActions(prev => [...prev, last]);
  };

  const handleSave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) onSave(blob);
    }, 'image/png');
  }, [onSave]);

  useImperativeHandle(ref, () => ({ save: handleSave }), [handleSave]);

  const tools: { id: Tool; label: string; icon: string }[] = [
    { id: 'draw', label: 'Draw', icon: '✏️' },
    { id: 'rectangle', label: 'Rectangle', icon: '▢' },
    { id: 'arrow', label: 'Arrow', icon: '→' },
    { id: 'text', label: 'Text', icon: 'T' },
    { id: 'highlight', label: 'Highlight', icon: '🖍' },
  ];

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
          {tools.map(t => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                tool === t.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-800'
              }`}
              title={t.label}
            >
              <span className="mr-1">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="h-6 border-l border-gray-300" />

        <div className="flex gap-1">
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full border-2 transition-all ${
                color === c ? 'border-gray-800 scale-110' : 'border-gray-300'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <div className="h-6 border-l border-gray-300" />

        <button onClick={undo} disabled={actions.length === 0}
          className="px-2 py-1 text-xs font-medium rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-40">
          Undo
        </button>
        <button onClick={redo} disabled={undoneActions.length === 0}
          className="px-2 py-1 text-xs font-medium rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-40">
          Redo
        </button>
      </div>

      {/* Canvas */}
      <div className="relative border rounded-lg bg-gray-50 inline-block max-w-full">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="cursor-crosshair max-w-full"
          style={{ display: 'block' }}
        />
        {/* Text input overlay */}
        {textPos && (
          <div
            className="absolute z-50"
            style={{
              // Convert canvas coordinates back to CSS pixels for overlay positioning
              left: Math.min(
                textPos.x / (canvasRef.current ? canvasRef.current.width / canvasRef.current.getBoundingClientRect().width : 1),
                (canvasRef.current?.getBoundingClientRect().width || 300) - 170
              ),
              top: Math.max(0,
                textPos.y / (canvasRef.current ? canvasRef.current.height / canvasRef.current.getBoundingClientRect().height : 1) - 14
              ),
            }}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-1">
              <input
                ref={textInputRef}
                autoFocus
                value={textInput}
                onChange={e => { e.stopPropagation(); setTextInput(e.target.value); }}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Enter') { e.preventDefault(); handleTextSubmit(); }
                  if (e.key === 'Escape') { e.preventDefault(); setTextPos(null); setTextInput(''); }
                }}
                className="px-2 py-1.5 text-sm border-2 border-blue-500 rounded-l shadow-lg outline-none bg-white"
                style={{ minWidth: 160, maxWidth: 250 }}
                placeholder="Type text here..."
              />
              <button
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); handleTextSubmit(); }}
                className="px-2 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-r shadow-lg hover:bg-blue-600 border-2 border-blue-500"
              >
                ✓
              </button>
              <button
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setTextPos(null); setTextInput(''); }}
                className="px-1.5 py-1.5 bg-gray-100 text-gray-500 text-xs rounded shadow border border-gray-300 hover:bg-gray-200 ml-0.5"
              >
                ✕
              </button>
            </div>
            <div className="text-[9px] text-blue-500 mt-0.5 ml-0.5">Enter to place • Esc to cancel</div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn-secondary text-xs py-1.5 px-3">Cancel</button>
        <button onClick={handleSave} className="btn-primary text-xs py-1.5 px-3">Save Annotation</button>
      </div>
    </div>
  );
});

ScreenshotAnnotator.displayName = 'ScreenshotAnnotator';

export default ScreenshotAnnotator;
