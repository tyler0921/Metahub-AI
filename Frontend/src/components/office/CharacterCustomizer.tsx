import { HAIR_SWATCHES, SKIN_SWATCHES, type CustomAppearance } from './custom-character';
import styles from './CharacterCustomizer.module.css';

interface CharacterCustomizerProps {
  appearance: CustomAppearance;
  onChange: (next: CustomAppearance) => void;
  onClose: () => void;
}

/**
 * 대표님 외형 팝오버. 별도 미리보기 캔버스 없이 — 고르는 즉시 실제 오피스
 * 화면의 대표님 아바타에 반영되는 것 자체가 미리보기입니다.
 */
export function CharacterCustomizer({
  appearance,
  onChange,
  onClose,
}: CharacterCustomizerProps): React.JSX.Element {
  return (
    <section className={styles.panel} aria-label="대표님 외형 설정">
      <header className={styles.header}>
        <strong>대표님 외형</strong>
        <button type="button" onClick={onClose} aria-label="닫기">
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div className={styles.row}>
        <span className={styles.label}>셔츠</span>
        <input
          type="color"
          className={styles.colorInput}
          value={appearance.shirt}
          onChange={(e) => onChange({ ...appearance, shirt: e.target.value })}
          aria-label="셔츠 색상"
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label}>머리</span>
        <div className={styles.swatches}>
          {HAIR_SWATCHES.map((hex) => (
            <button
              key={hex}
              type="button"
              className={`${styles.swatch} ${appearance.hair === hex ? styles.swatchActive : ''}`}
              style={{ background: hex }}
              onClick={() => onChange({ ...appearance, hair: hex })}
              aria-label={`머리색 ${hex}`}
              aria-pressed={appearance.hair === hex}
            />
          ))}
        </div>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>피부</span>
        <div className={styles.swatches}>
          {SKIN_SWATCHES.map((hex) => (
            <button
              key={hex}
              type="button"
              className={`${styles.swatch} ${appearance.skin === hex ? styles.swatchActive : ''}`}
              style={{ background: hex }}
              onClick={() => onChange({ ...appearance, skin: hex })}
              aria-label={`피부색 ${hex}`}
              aria-pressed={appearance.skin === hex}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
