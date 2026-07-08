from __future__ import annotations

from typing import TYPE_CHECKING, Literal, overload

from plugins.runtime.python.storage import DeviceStorage
from plugins.runtime.python.store import CameraLocation, PluginLocation, SensorLocation

if TYPE_CHECKING:
    from _camera_ui_tools.camera_ui_rpc import RPCClient
    from _camera_ui_tools.camera_ui_sdk import JsonSchema, SensorType
    from plugins.runtime.python.config_db import PluginConfigDb
    from plugins.runtime.python.plugin_api import PluginAPI
    from plugins.runtime.python.typings import PluginInfo


# Stable storage key for sensor instance storage.
def sensor_storage_key(camera_id: str, sensor_type: str, plugin_id: str, sensor_name: str) -> str:
    return f"{camera_id}:sensor:{sensor_type}:{plugin_id}:{sensor_name}"


class StorageController:
    def __init__(
        self,
        api: PluginAPI,
        proxy: RPCClient,
        plugin: PluginInfo,
        plugin_db: PluginConfigDb,
    ) -> None:
        self.__api: PluginAPI = api
        self.__proxy = proxy
        self.__plugin = plugin
        self.__storages: dict[str, DeviceStorage] = {}
        self.__plugin_db = plugin_db

    def createCameraStorage(self, cameraId: str, schemas: list[JsonSchema] | None = []) -> DeviceStorage:
        if schemas is None:
            schemas = []

        camera_storage = self.__storages.get(cameraId)

        if not camera_storage:
            camera_storage = DeviceStorage(
                self.__api,
                self.__proxy,
                self.__plugin,
                self.__plugin_db,
                CameraLocation(camera_id=cameraId),
                schemas,
            )
            self.__storages[cameraId] = camera_storage
        else:
            camera_storage.update_schema(schemas)

        return camera_storage

    def createPluginStorage(self, schemas: list[JsonSchema] | None = []) -> DeviceStorage:
        if schemas is None:
            schemas = []

        plugin_storage = self.__storages.get("storage")

        if not plugin_storage:
            plugin_storage = DeviceStorage(
                self.__api,
                self.__proxy,
                self.__plugin,
                self.__plugin_db,
                PluginLocation(),
                schemas,
            )
            self.__storages["storage"] = plugin_storage
        else:
            plugin_storage.update_schema(schemas)

        return plugin_storage

    def getCameraStorage(self, camera_id: str) -> DeviceStorage | None:
        return self.__storages.get(camera_id)

    def getPluginStorage(self) -> DeviceStorage | None:
        return self.__storages.get("storage")

    def createSensorStorage(
        self,
        camera_id: str,
        sensor_type: SensorType,
        plugin_id: str,
        sensor_name: str,
        sensor_id: str,
        schemas: list[JsonSchema] = [],
    ) -> DeviceStorage:
        storage_key = sensor_storage_key(camera_id, sensor_type.value, plugin_id, sensor_name)
        storage = self.__storages.get(storage_key)

        if not storage:
            # storage_key is only the in-memory registry key; persistence addresses
            # the canonical sensors.<camId>.<type>.<name> path. sensor_id is the
            # runtime UUID for the RPC namespace.
            storage = DeviceStorage(
                self.__api,
                self.__proxy,
                self.__plugin,
                self.__plugin_db,
                SensorLocation(camera_id=camera_id, sensor_type=sensor_type.value, sensor_name=sensor_name),
                schemas,
                sensor_id,
            )
            self.__storages[storage_key] = storage
            storage.update_schema(schemas)
        else:
            storage.update_schema(schemas)

        return storage

    def getSensorStorage(
        self, camera_id: str, sensor_type: SensorType, plugin_id: str, sensor_name: str
    ) -> DeviceStorage | None:
        storage_key = sensor_storage_key(camera_id, sensor_type.value, plugin_id, sensor_name)
        return self.__storages.get(storage_key)

    @overload
    async def createStorage(self, type_: Literal["camera"], device_id: str) -> DeviceStorage: ...
    @overload
    async def createStorage(self, type_: Literal["plugin"], device_id: None = None) -> DeviceStorage: ...
    @overload
    async def createStorage(
        self,
        type_: Literal["sensor"],
        device_id: str,
        sensor_type: SensorType,
        plugin_id: str,
        sensor_name: str,
        sensor_id: str,
    ) -> DeviceStorage: ...
    async def createStorage(
        self,
        type_: Literal["camera", "plugin", "sensor"],
        device_id: str | None = None,  # camera_id
        sensor_type: SensorType | None = None,
        plugin_id: str | None = None,
        sensor_name: str | None = None,
        sensor_id: str | None = None,
    ) -> DeviceStorage:
        storage: DeviceStorage | None = None

        if type_ == "camera":
            if not device_id:
                raise ValueError("ID is required for storage creation")

            storage = self.createCameraStorage(device_id)
        elif type_ == "sensor":
            if not device_id or not sensor_type or not plugin_id or not sensor_name or not sensor_id:
                raise ValueError(
                    "cameraId, sensorType, pluginId, sensorName and sensorId are required for sensor storage creation"
                )

            storage = self.createSensorStorage(device_id, sensor_type, plugin_id, sensor_name, sensor_id)
        else:
            storage = self.createPluginStorage()

        await storage.register_storage()
        return storage

    @overload
    async def removeStorage(self, type_: Literal["camera"], device_id: str) -> None: ...
    @overload
    async def removeStorage(self, type_: Literal["plugin"], device_id: None) -> None: ...
    @overload
    async def removeStorage(
        self,
        type_: Literal["sensor"],
        device_id: str | None = None,
        sensor_type: SensorType | None = None,
        plugin_id: str | None = None,
        sensor_name: str | None = None,
    ) -> None: ...
    async def removeStorage(
        self,
        type_: Literal["camera", "plugin", "sensor"],
        device_id: str | None = None,
        sensor_type: SensorType | None = None,
        plugin_id: str | None = None,
        sensor_name: str | None = None,
    ) -> None:
        storage_key: str

        if type_ == "sensor":
            if not device_id or not sensor_type or not plugin_id or not sensor_name:
                raise ValueError(
                    "cameraId, sensorType, pluginId and sensorName are required for sensor storage removal"
                )

            storage_key = sensor_storage_key(device_id, sensor_type.value, plugin_id, sensor_name)
        elif type_ == "camera":
            if not device_id:
                raise ValueError("ID is required for storage removal")
            storage_key = device_id
        else:
            storage_key = "storage"

        device_storage = self.__storages.get(storage_key)
        if device_storage:
            await device_storage.destroy()
            await device_storage.unregister_storage()
            del self.__storages[storage_key]
            return

    # Internal method to close all storages
    async def close(self) -> None:
        for storage in self.__storages.values():
            await storage.close()
