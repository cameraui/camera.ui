import { axiosInstance as api } from '..';

import type { CreateRoomInput, DBRoom, DBRoomCatalog } from '@shared/types';
import type { AxiosResponse } from 'axios';

export async function getRooms({ signal }: { signal?: AbortSignal } = {}): Promise<DBRoomCatalog> {
  const response: AxiosResponse<DBRoomCatalog> = await api.get('/rooms', { signal });
  return response.data;
}

export async function createRoom(room: CreateRoomInput): Promise<DBRoom> {
  const response: AxiosResponse<DBRoom> = await api.post('/rooms', room);
  return response.data;
}

export async function deleteRoom(roomId: string): Promise<void> {
  await api.delete(`/rooms/${roomId}`);
}

export class RoomsQuery {
  private queryClient = useQueryClient();

  public getRoomsQuery() {
    return useQueryEnhanced({
      queryKey: ['rooms'],
      queryFn: ({ signal }) => getRooms({ signal }),
      staleTime: 10_000,
    });
  }

  public createRoomMutation() {
    return useMutation({
      mutationFn: createRoom,
      onSuccess: async () => {
        await this.queryClient.refetchQueries({ queryKey: ['rooms'], exact: true });
      },
    });
  }

  public deleteRoomMutation() {
    return useMutation({
      mutationFn: deleteRoom,
      onSuccess: async () => {
        await Promise.all([this.queryClient.refetchQueries({ queryKey: ['rooms'], exact: true }), this.queryClient.refetchQueries({ queryKey: ['cameras'] })]);
      },
    });
  }
}
