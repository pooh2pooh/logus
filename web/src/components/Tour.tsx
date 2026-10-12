import { useEffect, useState } from "react";
import { useTraining } from "../training/context.js";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Мягкая подсветка («прожектор») целевого элемента Помощника. Оверлей не
 * перехватывает клики — пользователь продолжает работать с интерфейсом.
 * Прямоугольник пересчитывается на каждом кадре: окна и списки анимируются.
 */
export function Tour() {
  const training = useTraining();
  const target = training.active && !training.finished ? training.target : null;
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!target) {
      setRect(null);
      return;
    }
    let raf = 0;
    const measure = () => {
      const el = document.querySelector(target);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect((prev) =>
        prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height
          ? prev
          : { top: r.top, left: r.left, width: r.width, height: r.height },
      );
    };
    measure();
    const loop = () => {
      measure();
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [target]);

  if (!target || !rect) return null;

  const pad = 8;
  return (
    <div className="tour" aria-hidden="true">
      <div
        className="tour__ring"
        style={{
          top: rect.top - pad,
          left: rect.left - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
        }}
      />
    </div>
  );
}
