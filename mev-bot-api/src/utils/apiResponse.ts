export class ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;

  constructor(message: string, data?: T) {
    this.success = true;
    this.message = message;
    if (data) this.data = data;
  }
}
