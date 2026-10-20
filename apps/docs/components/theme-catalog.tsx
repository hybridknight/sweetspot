import { THEME_PRESETS } from '../../sweetspot/src/shared/themes/catalog';
import styles from './theme-catalog.module.css';

export function ThemeCatalog() {
  return (
    <div className="not-prose">
      <p className={styles.intro}>
        Compare {THEME_PRESETS.length} built-in themes, from quiet light palettes to deep colors.
        Select a theme in the app to apply it.
      </p>
      <ul className={styles.grid} aria-label="Built-in themes">
        {THEME_PRESETS.map((theme) => (
          <li className={styles.card} key={theme.id}>
            <div
              className={styles.preview}
              aria-hidden="true"
              style={{ background: theme.background, color: theme.text }}
            >
              <div className={styles.bar} style={{ background: theme.surface }}>
                <span className={styles.dot} style={{ background: theme.accent }} />
                <span className={styles.search} style={{ background: theme.elevated }} />
              </div>
              <div className={styles.content}>
                <span className={styles.heading}>Your daily mix</span>
                <div className={styles.albums}>
                  {[theme.accent, theme.muted, theme.elevated].map((color, index) => (
                    <span key={index} style={{
                      background: `linear-gradient(135deg, ${color}, ${theme.surface})`,
                      borderRadius: Math.min(theme.radius, 12),
                    }} />
                  ))}
                </div>
                <div className={styles.player} style={{ background: theme.surface, borderRadius: theme.radius }}>
                  <span style={{ color: theme.muted }}>Made for you</span>
                  <span className={styles.play} style={{ background: theme.accent, color: theme.onAccent, borderRadius: theme.id === 'mnml' ? 999 : theme.radius }}>▶</span>
                </div>
              </div>
            </div>
            <div className={styles.details}>
              <div className={styles.title}>
                <span>{theme.name}</span>
                <span className={styles.mode}>{theme.light ? 'Light' : 'Dark'}</span>
              </div>
              <p className={styles.style}>{theme.style}</p>
              <p className={styles.description}>{theme.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
