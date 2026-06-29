import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Star } from 'lucide-react';

interface CustomerScoreData {
  avgScore: number | null;
  responseCount: number;
  totalResponses?: number;
  scale?: number;
}

function StarRating({ score }: { score: number }) {
  const filled = Math.round(score / 10);
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-10 w-10 ${i <= filled ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 dark:text-gray-600'}`}
        />
      ))}
    </div>
  );
}

export default function CustomerScoreSlide() {
  const { data, isLoading } = useQuery<CustomerScoreData>({
    queryKey: ['/api/financial-review/live/customer-score'],
  });

  const score = data?.avgScore;
  const scale = data?.scale ?? 50;

  return (
    <div className="h-full flex flex-col px-10 py-8">
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">Customer Satisfaction Score</h2>
      <div className="h-1 w-16 bg-blue-500 rounded mb-6" />

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          {score != null ? (
            <>
              <div className="text-8xl font-bold text-gray-900 dark:text-white">
                {score.toFixed(1)}
                <span className="text-4xl text-gray-400">/{scale}</span>
              </div>
              <StarRating score={score} />
              <div className="text-gray-500 dark:text-gray-400 text-lg">
                Based on {data?.responseCount ?? 0} scored responses from /customer-satisfaction
              </div>
            </>
          ) : (
            <div className="text-gray-400 text-xl italic">No customer satisfaction data available</div>
          )}
        </div>
      )}
      <div className="text-xs text-gray-400 mt-2 text-right">customer_satisfaction_responses</div>
    </div>
  );
}
