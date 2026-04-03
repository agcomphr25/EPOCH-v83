import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';

interface FlippableCardProps {
  front: ReactNode;
  back: ReactNode;
  className?: string;
}

export default function FlippableCard({ front, back, className }: FlippableCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div
      className={className}
      style={{ perspective: 1200 }}
      onMouseEnter={() => setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
    >
      <motion.div
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        style={{ transformStyle: 'preserve-3d', position: 'relative', width: '100%', height: '100%' }}
      >
        <div
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            position: 'relative',
            width: '100%',
          }}
        >
          {front}
        </div>

        <div
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
          }}
        >
          {back}
        </div>
      </motion.div>
    </div>
  );
}
