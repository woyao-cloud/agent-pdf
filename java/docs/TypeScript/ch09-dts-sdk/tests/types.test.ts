import { expectType, expectError } from 'tsd';
import { SDK } from '../types';

const sdk = new SDK({ baseUrl: 'https://api.example.com' });
expectType<Promise<{ id: string; name: string; email: string }>>(sdk.getUser('1'));
expectError(sdk.getUser(123)); // 参数类型错误
