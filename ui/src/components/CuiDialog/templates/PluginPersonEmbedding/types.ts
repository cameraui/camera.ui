export interface PluginPersonEmbeddingProps {
  src: HTMLMediaElement['src'];
  embeddingModel: string;
  dimensions: number;
  onSearch?: () => void;
}
