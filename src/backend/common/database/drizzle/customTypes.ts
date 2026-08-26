import { customType } from "drizzle-orm/sqlite-core";
import dayjs, { type Dayjs } from "dayjs";

export const DayjsTimestamp = customType<
  {
    data: Dayjs;
    driverData: number;
  }
>({
  dataType() {
    return 'number'
  },
  toDriver(value: Dayjs): number {
    return value.valueOf();
  },
  fromDriver(value: number): Dayjs {
    return dayjs(value);
  },
});
