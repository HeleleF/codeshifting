export interface Activity {
  readonly id: string;
  readonly initId?: string;
  readonly dataHolders: any[];
  readonly lock?: number;
}

export interface View {
  readonly activity: Activity;
  readonly other: number;
  readonly other2: number;
}

export interface ViewNeu {
  readonly activityId: string;
}

export declare function useSelector(
  func: () => Activity | undefined
): Activity | undefined;

export declare namespace ActivitySelectors {
  export function activityById(id: string): () => Activity | undefined;
}
