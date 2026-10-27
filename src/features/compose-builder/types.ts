// compose の組み立て（docs/10-container-tools.md 4.2）の型。vscode・DOM に依存しない
import type { ContainerImagesFile } from '../../core/containerImages';

/** ビルド済みコンテンツの名前（dist/content/container-compose-services.json） */
export const COMPOSE_SERVICES_CONTENT = 'container-compose-services';

export type ServiceKind = 'database' | 'cache' | 'mail' | 'tool';
export type ServiceField = 'database' | 'user' | 'password';
export type AppFramework = 'spring' | 'node';

export interface EnvVarTemplate {
  name: string;
  /** {service}・{port}・{database} などを含む値（content/container/compose-services.yaml の先頭の説明） */
  value: string;
  explain?: string;
}

export interface ServicePort {
  id: string;
  label: string;
  container: number;
  /** 既定のホスト側のポート */
  host: number;
  explain?: string;
}

export interface ServiceDef {
  id: string;
  name: string;
  kind: ServiceKind;
  /** content/container/images.yaml の id */
  image: string;
  description: string;
  explain: string;
  fields?: ServiceField[];
  defaults?: { database?: string; user?: string };
  passwordEnv?: string;
  reservedUsers?: string[];
  ports: ServicePort[];
  command?: { args: string[]; explain: string };
  environment?: EnvVarTemplate[];
  healthcheck?: { test: string[]; explain: string };
  volume?: { target: string };
  initDir?: string;
  waitFor?: Exclude<ServiceKind, 'tool'>;
  /** LAN に公開したときに困ること（「LAN に公開する」を選んだときの注意に出す） */
  lanRisk?: string;
  connect?: {
    spring?: EnvVarTemplate[];
    node?: EnvVarTemplate[];
    host?: { label: string; value: string; for?: AppFramework }[];
  };
}

export interface ComposeServicesFile {
  version: 1;
  crowdedPorts: number[];
  services: ServiceDef[];
}

/** ホストの initData で渡すもの */
export interface ComposeBuilderData {
  services: ComposeServicesFile;
  images: ContainerImagesFile;
}

// ---- 入力 ----

export type AppMode = 'none' | 'build' | 'image';

export interface AppInput {
  mode: AppMode;
  /** mode が image のときのイメージ名 */
  image: string;
  framework: AppFramework;
  /** ポート（文字列のまま受け取り、組み立てで検査する） */
  hostPort: string;
  containerPort: string;
  /** Spring のプロファイル（空なら指定しない） */
  profile: string;
  /** 追加の環境変数（1 行に 1 つ「名前=値」） */
  extraEnv: string;
}

export interface ServiceInput {
  id: string;
  /** ポートの id → ホスト側のポート（空ならホストに公開しない） */
  ports: Record<string, string>;
  database?: string;
  user?: string;
  /** 保存しない（画面の中だけ） */
  password?: string;
}

export interface ComposeInput {
  projectName: string;
  app: AppInput;
  /** 選んだ部品（並びはデータの順に直して出力する） */
  services: ServiceInput[];
  /** データを残す（名前付きボリューム） */
  persist: boolean;
  /** 初期化 SQL のフォルダ（空なら使わない） */
  initSqlDir: string;
  /**
   * LAN に公開する（ほかの PC から繋ぐ）。false（既定）ならポートを 127.0.0.1 だけに公開し、
   * 同じネットワークのほかの PC からは繋がらない
   */
  lan: boolean;
}

// ---- 出力 ----

export interface Connection {
  service: string;
  name: string;
  items: { label: string; value: string }[];
}
