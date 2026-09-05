import { useState } from "react";
import { categories, poiSchema, errorText, type Poi } from "./domain";
export default function PoiEditor({
  poi,
  onSave,
  onCancel,
}: {
  poi: Poi;
  onSave: (p: Poi) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(poi),
    [error, setError] = useState("");
  function field<K extends keyof Poi>(k: K, v: Poi[K]) {
    setDraft({ ...draft, [k]: v });
  }
  return (
    <form
      className="editor"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onSave(poiSchema.parse(draft));
        } catch (err) {
          setError(errorText(err));
        }
      }}
    >
      <div className="section-heading">
        <h2>{poi.name ? "Editar lugar" : "Nuevo lugar"}</h2>
        <button type="button" onClick={onCancel} aria-label="Cerrar editor">
          ×
        </button>
      </div>
      <label>
        Nombre
        <input
          autoFocus
          required
          maxLength={120}
          value={draft.name}
          onChange={(e) => field("name", e.target.value)}
        />
      </label>
      <label>
        Categoría
        <select
          value={draft.type}
          onChange={(e) => field("type", e.target.value)}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Región
        <input
          maxLength={160}
          value={draft.region}
          onChange={(e) => field("region", e.target.value)}
        />
      </label>
      <div className="two">
        <label>
          Importancia
          <select
            value={draft.importance}
            onChange={(e) => field("importance", Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
        </label>
        <label>
          Confianza del dato
          <select
            value={draft.confidence}
            onChange={(e) => field("confidence", Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Descripción
        <textarea
          rows={3}
          maxLength={10000}
          value={draft.description}
          onChange={(e) => field("description", e.target.value)}
        />
      </label>
      <label>
        Etiquetas · separadas por comas
        <input
          value={draft.tags.join(", ")}
          onChange={(e) =>
            field(
              "tags",
              e.target.value.split(",").map((t) => t.trim()),
            )
          }
        />
      </label>
      <label>
        Facción
        <input
          maxLength={160}
          value={draft.faction}
          onChange={(e) => field("faction", e.target.value)}
        />
      </label>
      <div className="two">
        <label>
          Agua
          <select
            value={draft.water}
            onChange={(e) => field("water", e.target.value as Poi["water"])}
          >
            <option value="unknown">Desconocida</option>
            <option value="none">No disponible</option>
            <option value="limited">Escasa</option>
            <option value="available">Disponible</option>
          </select>
        </label>
        <label>
          Peligro
          <select
            value={draft.danger}
            onChange={(e) => field("danger", e.target.value as Poi["danger"])}
          >
            <option value="unknown">Desconocido</option>
            <option value="low">Bajo</option>
            <option value="medium">Medio</option>
            <option value="high">Alto</option>
          </select>
        </label>
      </div>
      <label>
        Notas privadas del DJ
        <textarea
          rows={3}
          maxLength={10000}
          value={draft.notes}
          onChange={(e) => field("notes", e.target.value)}
        />
      </label>
      <label>
        Fuente
        <input
          maxLength={1000}
          value={draft.source}
          onChange={(e) => field("source", e.target.value)}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={draft.visible}
          onChange={(e) => field("visible", e.target.checked)}
        />
        Visible en el mapa
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="two">
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
        <button className="primary" type="submit">
          Guardar lugar
        </button>
      </div>
    </form>
  );
}
