import { useState } from "react";
import { cityGuideFor } from "./domain";
import ConfirmDialog from "./ConfirmDialog";

const dangerLabel: Record<string, string> = {
  baja: "Peligro bajo",
  media: "Peligro medio",
  alta: "Peligro alto",
  extrema: "Peligro extremo",
};

export default function CityGuide({
  poiId,
  onClose,
}: {
  poiId: string;
  onClose: () => void;
}) {
  const guide = cityGuideFor(poiId);
  const [imageOk, setImageOk] = useState(true);
  if (!guide) return null;
  return (
    <ConfirmDialog onClose={onClose}>
      <article className="city">
        <div className={`city-figure danger-${guide.danger}`}>
          {imageOk ? (
            <img
              src={`/cities/${guide.id}.jpg`}
              alt={`Vista de ${guide.name}`}
              onError={() => setImageOk(false)}
            />
          ) : (
            <span aria-hidden="true">◈</span>
          )}
        </div>
        <header className="city-head">
          <div>
            <p className="city-epithet">{guide.epithet}</p>
            <h2 id="confirm-title">{guide.name}</h2>
          </div>
          <span className={`city-danger ${guide.danger}`}>
            {dangerLabel[guide.danger]}
          </span>
        </header>
        <p className="city-ruler">♜ {guide.ruler}</p>
        <p className="city-summary">{guide.summary}</p>
        <dl className="city-facts">
          {guide.facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
        <p className="city-hook">«{guide.hook}»</p>
        <div className="city-tags">
          {guide.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <details className="city-prompt">
          <summary>Prompt de imagen</summary>
          <p>{guide.imagePrompt}</p>
        </details>
        <button className="primary full" onClick={onClose}>
          Cerrar
        </button>
      </article>
    </ConfirmDialog>
  );
}
