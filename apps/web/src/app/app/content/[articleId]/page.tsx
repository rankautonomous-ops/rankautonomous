import { Suspense } from 'react';
import ArticleWorkspace from './ArticleWorkspace';
import styles from '../content.module.css';

export default async function ArticlePage({ params }: { params: Promise<{ articleId: string }> }) {
  const resolvedParams = await params;
  return (
    <div className={styles.contentContainer}>
      <Suspense fallback={<div>Loading workspace...</div>}>
        <ArticleWorkspace articleId={resolvedParams.articleId} />
      </Suspense>
    </div>
  );
}
