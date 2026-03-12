interface Props {
  title: string;
  subtitle?: string;
}

export default function SectionHeaderSlide({ title, subtitle }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-16 px-8">
      <div className="w-16 h-1 bg-blue-500 rounded mb-6" />
      <h2 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">{title}</h2>
      {subtitle && (
        <p className="text-xl text-gray-500 dark:text-gray-400 mt-2">{subtitle}</p>
      )}
      <div className="w-16 h-1 bg-blue-500 rounded mt-6" />
    </div>
  );
}
