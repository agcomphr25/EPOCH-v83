import { useEffect, useRef } from 'react';

export function useScrollDepth() {
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const animateDepth = () => {
      const cards = document.querySelectorAll('.depth-card');
      const vh = window.innerHeight;

      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        const cardCenter = rect.top + rect.height / 2;
        const dist = Math.abs(cardCenter - vh / 2);
        const norm = Math.min(dist / (vh / 2), 1);
        
        const scale = 1.03 - norm * 0.03;
        const shadowBlur = 25 - norm * 20;
        const shadowSpread = 50 - norm * 35;
        const shadowOpacity = 0.55 - norm * 0.35;

        const htmlCard = card as HTMLElement;
        htmlCard.style.transform = `scale(${scale})`;
        htmlCard.style.boxShadow = `0 ${shadowBlur}px ${shadowSpread}px rgba(0,0,0,${shadowOpacity})`;
      });

      animationRef.current = requestAnimationFrame(animateDepth);
    };

    animateDepth();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);
}
