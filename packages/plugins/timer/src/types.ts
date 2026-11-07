export interface TimerState {
  totalSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  isFinished: boolean;
  showNumbers: boolean;
  customMinutesInput: string;
}
