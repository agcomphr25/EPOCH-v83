import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  BookOpen, 
  HelpCircle, 
  Plus, 
  Search,
  FileText,
  Clock,
  Lightbulb
} from 'lucide-react';

interface TrainingModule {
  id: number;
  title: string;
  description?: string;
  category?: string;
  estimatedDuration?: number;
}

interface TrainingQuestion {
  id: number;
  moduleId: number;
  questionText: string;
  questionType: string;
}

interface TrainingTopic {
  id: string;
  title: string;
  description?: string;
  category?: string;
  materialsCount?: number;
}

interface ContentLibraryProps {
  onAddModule: (module: TrainingModule) => void;
  onAddQuestion: (question: TrainingQuestion) => void;
  onAddTopic?: (topic: TrainingTopic) => void;
}

export default function ContentLibrary({ onAddModule, onAddQuestion, onAddTopic }: ContentLibraryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('topics');

  const { data: modules = [], isLoading: modulesLoading } = useQuery<TrainingModule[]>({
    queryKey: ['/api/training/modules'],
  });

  const { data: questions = [], isLoading: questionsLoading } = useQuery<TrainingQuestion[]>({
    queryKey: ['/api/training/questions'],
  });

  const { data: topics = [], isLoading: topicsLoading } = useQuery<TrainingTopic[]>({
    queryKey: ['/api/training/content-library/topics'],
  });

  const filteredModules = modules.filter(m => 
    m.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredQuestions = questions.filter(q =>
    q.questionText?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredTopics = topics.filter(t =>
    t.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Content Library
        </CardTitle>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search content..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full rounded-none border-b">
            <TabsTrigger value="topics" className="flex-1 gap-1">
              <Lightbulb className="h-4 w-4" />
              Topics
            </TabsTrigger>
            <TabsTrigger value="modules" className="flex-1 gap-1">
              <FileText className="h-4 w-4" />
              Modules
            </TabsTrigger>
            <TabsTrigger value="questions" className="flex-1 gap-1">
              <HelpCircle className="h-4 w-4" />
              Questions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="topics" className="m-0">
            <ScrollArea className="h-[400px]">
              {topicsLoading ? (
                <div className="p-4 text-center text-muted-foreground">Loading topics...</div>
              ) : filteredTopics.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  {searchTerm ? 'No topics match your search' : 'No training topics available'}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredTopics.map((topic) => (
                    <div key={topic.id} className="p-3 hover:bg-muted/50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate">{topic.title}</h4>
                          {topic.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                              {topic.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            {topic.category && (
                              <Badge variant="secondary" className="text-xs">
                                {topic.category}
                              </Badge>
                            )}
                            {topic.materialsCount !== undefined && topic.materialsCount > 0 && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                {topic.materialsCount} materials
                              </span>
                            )}
                          </div>
                        </div>
                        {onAddTopic && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onAddTopic(topic)}
                            className="shrink-0"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="modules" className="m-0">
            <ScrollArea className="h-[400px]">
              {modulesLoading ? (
                <div className="p-4 text-center text-muted-foreground">Loading modules...</div>
              ) : filteredModules.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  {searchTerm ? 'No modules match your search' : 'No training modules available'}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredModules.map((module) => (
                    <div key={module.id} className="p-3 hover:bg-muted/50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate">{module.title}</h4>
                          {module.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                              {module.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            {module.category && (
                              <Badge variant="secondary" className="text-xs">
                                {module.category}
                              </Badge>
                            )}
                            {module.estimatedDuration && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {module.estimatedDuration} min
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onAddModule(module)}
                          className="shrink-0"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="questions" className="m-0">
            <ScrollArea className="h-[400px]">
              {questionsLoading ? (
                <div className="p-4 text-center text-muted-foreground">Loading questions...</div>
              ) : filteredQuestions.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  {searchTerm ? 'No questions match your search' : 'No quiz questions available'}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredQuestions.map((question) => (
                    <div key={question.id} className="p-3 hover:bg-muted/50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm line-clamp-2">{question.questionText}</p>
                          <Badge variant="outline" className="text-xs mt-1">
                            {question.questionType}
                          </Badge>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onAddQuestion(question)}
                          className="shrink-0"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
