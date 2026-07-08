from __future__ import annotations

import asyncio
from typing import Any

from _camera_ui_tools.camera_ui_common import (
    LoggerService,
)
from _camera_ui_tools.camera_ui_rpc import CloseHandler, RPCClient
from _camera_ui_tools.camera_ui_sdk import (
    BasePlugin,
    Camera,
    DeviceManager,
    DiscoveredCamera,
)
from plugins.runtime.python.namespaces import (
    DeviceManagerNamespaces,
    DiscoveryManagerNamespaces,
    NamespaceManager,
    PluginNamespaces,
)
from plugins.runtime.python.rpc.typings import (
    DeviceManagerInterface,
    DiscoveryManagerInterface,
)
from plugins.runtime.python.storage_controller import StorageController
from plugins.runtime.python.typings import PluginInfo

from .camera_device import CameraDeviceProxy


class DeviceManagerProxy(DeviceManager):
    def __init__(
        self,
        proxy: RPCClient,
        storage_controller: StorageController,
        logger: LoggerService,
        plugin: PluginInfo,
    ):
        self.__initialized = False
        self.__plugin_instance: BasePlugin | None = None

        self.__proxy = proxy
        self.__storage_controller = storage_controller
        self.__logger = logger
        self.__plugin = plugin
        self.__close_request: CloseHandler | None = None

        self.__devices: dict[str, CameraDeviceProxy] = {}
        self.__namespaces: tuple[DeviceManagerNamespaces, PluginNamespaces, DiscoveryManagerNamespaces] = (
            NamespaceManager.device_manager_namespaces(),
            NamespaceManager.plugin_namespaces(self.__plugin["id"]),
            NamespaceManager.discovery_manager_namespaces(),
        )

    @property
    def __device_manager_proxy(self) -> DeviceManagerInterface:
        return self.__proxy.create_proxy(self.__namespaces[0].device_manager_rpc, DeviceManagerInterface)

    @property
    def __discovery_manager_proxy(self) -> DiscoveryManagerInterface:
        return self.__proxy.create_proxy(
            self.__namespaces[2].discovery_manager_rpc, DiscoveryManagerInterface
        )

    def set_plugin(self, plugin: BasePlugin) -> None:
        self.__plugin_instance = plugin

    async def init(self) -> None:
        if self.__initialized:
            return

        self.__initialized = True
        self.__close_request = await self.__proxy.on_request(
            self.__namespaces[1].plugin_device_manager_subject, self.__on_event_message
        )

    async def getCamera(self, cameraIdOrName: str) -> CameraDeviceProxy | None:
        camera_device = await self.__get_camera_device(cameraIdOrName)

        if not camera_device:
            camera = await self.__device_manager_proxy.getCamera(cameraIdOrName, self.__plugin["id"])

            if camera:
                camera_device = await self.__get_camera_device(camera)

        return camera_device

    async def pushDiscoveredCameras(self, cameras: list[DiscoveredCamera]) -> None:
        await self.__discovery_manager_proxy.pushDiscoveredCameras(self.__plugin["id"], cameras)

    async def configureCameras(self, camera_devices: list[CameraDeviceProxy]) -> None:
        await asyncio.gather(*[self.__get_camera_device(camera_device) for camera_device in camera_devices])

    async def close(self) -> None:
        """Internal method to close the device manager proxy and cleanup resources."""
        self.__initialized = False
        if self.__close_request:
            await self.__close_request()

        for device in self.__devices.values():
            await device.cleanup()
        self.__devices.clear()

    async def __on_event_message(self, event: Any) -> None:
        if not self.__plugin_instance:
            self.__logger.warn("Plugin instance not set, cannot handle lifecycle event")
            return

        event_type = event.get("type")
        data = event.get("data", {})

        if event_type == "cameraAdded":
            camera: Camera = data.get("camera")
            camera_device = await self.__get_camera_device(camera)

            if camera_device:
                # Call plugin lifecycle callback
                await self.__plugin_instance.onCameraAdded(camera_device)

        elif event_type == "cameraReleased":
            camera_id: str = data.get("cameraId")

            # Call plugin lifecycle callback
            await self.__plugin_instance.onCameraReleased(camera_id)

            # Cleanup
            camera_device = self.__devices.get(camera_id)
            if camera_device:
                await camera_device.cleanup()

            await self.__remove_camera_storage(camera_id)

            if camera_id in self.__devices:
                del self.__devices[camera_id]

    async def __get_camera_device(
        self, camera_or_id: Camera | CameraDeviceProxy | str
    ) -> CameraDeviceProxy | None:
        camera_device: CameraDeviceProxy | None = None

        if isinstance(camera_or_id, str):
            id = camera_or_id

            camera_device = next(
                (device for device in self.__devices.values() if device.id == id or device.name == id),
                None,
            )
        elif isinstance(camera_or_id, CameraDeviceProxy):
            camera_device = camera_or_id
            if camera_device.id in self.__devices:
                camera_device = self.__devices[camera_device.id]
            else:
                self.__devices[camera_device.id] = camera_device
        else:
            camera = camera_or_id
            if camera["_id"] in self.__devices:
                camera_device = self.__devices[camera["_id"]]
            else:
                camera_logger = self.__logger.create_logger(
                    {
                        "suffix": camera["name"],
                        "target_id": camera["_id"],
                        "target_type": "camera",
                    }
                )
                camera_device = CameraDeviceProxy(
                    self.__proxy,
                    self.__storage_controller,
                    camera,
                    self.__plugin,
                    camera_logger,
                )

                self.__devices[camera["_id"]] = camera_device

        if camera_device:
            await self.__create_camera_storage(camera_device.id)
            await camera_device.init()

        return camera_device

    async def __create_camera_storage(self, camera_id: str) -> None:
        await self.__storage_controller.createStorage("camera", camera_id)

    async def __remove_camera_storage(self, camera_id: str) -> None:
        await self.__storage_controller.removeStorage("camera", camera_id)
