import { Plus, Trash2, Edit3, Save } from "lucide-react";
import { useState } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

interface Note {
  id: number;
  content: string;
  x: number;
  y: number;
  color: string;
}

const colors = [
  { name: "Jaune", value: "bg-yellow-200 dark:bg-yellow-200/90" },
  { name: "Rose", value: "bg-pink-200 dark:bg-pink-200/90" },
  { name: "Bleu", value: "bg-blue-200 dark:bg-blue-200/90" },
  { name: "Vert", value: "bg-green-200 dark:bg-green-200/90" },
  { name: "Orange", value: "bg-orange-200 dark:bg-orange-200/90" },
];

function DraggableNote({
  note,
  onUpdate,
  onDelete,
}: {
  note: Note;
  onUpdate: (id: number, updates: Partial<Note>) => void;
  onDelete: (id: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(note.content);

  const [{ isDragging }, drag] = useDrag(() => ({
    type: "note",
    item: { id: note.id, x: note.x, y: note.y },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const handleSave = () => {
    onUpdate(note.id, { content });
    setIsEditing(false);
  };

  return (
    <div
      ref={drag}
      className={`absolute w-64 h-48 p-4 rounded-lg shadow-lg cursor-move ${note.color} ${
        isDragging ? "opacity-50" : ""
      }`}
      style={{ left: note.x, top: note.y }}
    >
      <div className="flex justify-between items-start mb-2">
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="p-1 hover:bg-black/10 rounded transition-colors"
        >
          <Edit3 className="w-4 h-4 text-gray-700" />
        </button>
        <button
          onClick={() => onDelete(note.id)}
          className="p-1 hover:bg-black/10 rounded transition-colors"
        >
          <Trash2 className="w-4 h-4 text-gray-700" />
        </button>
      </div>
      {isEditing ? (
        <div className="flex flex-col h-[calc(100%-40px)]">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 bg-transparent border-none resize-none focus:outline-none text-gray-800 text-sm"
            placeholder="Écrire une note..."
          />
          <button
            onClick={handleSave}
            className="mt-2 flex items-center gap-2 bg-gray-800 text-white px-3 py-1 rounded text-sm hover:bg-gray-700 transition-colors self-end"
          >
            <Save className="w-3 h-3" />
            Enregistrer
          </button>
        </div>
      ) : (
        <p className="text-sm text-gray-800 whitespace-pre-wrap overflow-y-auto h-[calc(100%-40px)]">
          {note.content}
        </p>
      )}
    </div>
  );
}

function WhiteboardContent() {
  const [notes, setNotes] = useState<Note[]>([
    {
      id: 1,
      content: "Actions prioritaires:\n- Notification ANSSI\n- Communication externe",
      x: 50,
      y: 50,
      color: "bg-yellow-200 dark:bg-yellow-200/90",
    },
    {
      id: 2,
      content: "Points juridiques à vérifier avec Isabelle",
      x: 350,
      y: 50,
      color: "bg-pink-200 dark:bg-pink-200/90",
    },
    {
      id: 3,
      content: "Prochaine réunion: 16h00\nSalle de crise - Tous les responsables",
      x: 50,
      y: 280,
      color: "bg-blue-200 dark:bg-blue-200/90",
    },
  ]);
  const [selectedColor, setSelectedColor] = useState(colors[0].value);

  const [, drop] = useDrop(() => ({
    accept: "note",
    drop: (item: { id: number; x: number; y: number }, monitor) => {
      const delta = monitor.getDifferenceFromInitialOffset();
      if (delta) {
        const newX = Math.max(0, item.x + delta.x);
        const newY = Math.max(0, item.y + delta.y);
        updateNote(item.id, { x: newX, y: newY });
      }
    },
  }));

  const addNote = () => {
    const newNote: Note = {
      id: Date.now(),
      content: "",
      x: Math.random() * 600 + 50,
      y: Math.random() * 400 + 50,
      color: selectedColor,
    };
    setNotes([...notes, newNote]);
  };

  const updateNote = (id: number, updates: Partial<Note>) => {
    setNotes(notes.map((note) => (note.id === id ? { ...note, ...updates } : note)));
  };

  const deleteNote = (id: number) => {
    setNotes(notes.filter((note) => note.id !== id));
  };

  return (
    <div className="p-8 bg-[#0f1116] dark:bg-[#0f1116] bg-gray-50 min-h-screen">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl mb-2 text-gray-900 dark:text-white">Tableau blanc</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Espace collaboratif pour notes et brainstorming
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            {colors.map((color) => (
              <button
                key={color.name}
                onClick={() => setSelectedColor(color.value)}
                className={`w-8 h-8 rounded ${color.value} border-2 transition-all ${
                  selectedColor === color.value
                    ? "border-gray-900 dark:border-white scale-110"
                    : "border-transparent hover:scale-105"
                }`}
                title={color.name}
              />
            ))}
          </div>
          <button
            onClick={addNote}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Ajouter une note
          </button>
        </div>
      </div>

      <div
        ref={drop}
        className="relative bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg overflow-hidden"
        style={{ height: "calc(100vh - 250px)", minHeight: "600px" }}
      >
        {notes.map((note) => (
          <DraggableNote
            key={note.id}
            note={note}
            onUpdate={updateNote}
            onDelete={deleteNote}
          />
        ))}
        {notes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-600 dark:text-gray-400 text-center">
              Cliquez sur "Ajouter une note" pour commencer
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TableauBlanc() {
  return (
    <DndProvider backend={HTML5Backend}>
      <WhiteboardContent />
    </DndProvider>
  );
}
