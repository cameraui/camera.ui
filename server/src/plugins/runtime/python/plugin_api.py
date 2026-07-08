from typing import Any, cast

from _camera_ui_tools.camera_ui_common import LoggerService
from _camera_ui_tools.camera_ui_rpc import RPCClient
from _camera_ui_tools.camera_ui_sdk import (
    API_EVENT,
    APIListener,
    CoreManager,
    DeviceManager,
    DownloadManager,
    NotificationManager,
)
from _camera_ui_tools.camera_ui_sdk import PluginAPI as PluginAPIInterface
from _camera_ui_tools.camera_ui_sdk.internal import AsyncEventEmitter
from plugins.runtime.python.config_db import PluginConfigDb
from plugins.runtime.python.proxy.core_manager import CoreManagerProxy
from plugins.runtime.python.proxy.device_manager import DeviceManagerProxy
from plugins.runtime.python.proxy.download_manager import DownloadManagerProxy
from plugins.runtime.python.proxy.notification_manager import NotificationManagerProxy
from plugins.runtime.python.storage_controller import StorageController
from plugins.runtime.python.typings import PluginInfo


class PluginAPI(AsyncEventEmitter, PluginAPIInterface):
    def __init__(
        self,
        proxy: RPCClient,
        plugin: PluginInfo,
        storage_path: str,
        logger: LoggerService,
        plugin_db: PluginConfigDb,
    ) -> None:
        super().__init__()

        self.logger = logger
        self.storage_path = storage_path
        self.storage_controller = StorageController(self, proxy, plugin, plugin_db)
        self.core_manager = CoreManagerProxy(proxy, logger, plugin)
        self.device_manager = DeviceManagerProxy(proxy, self.storage_controller, logger, plugin)
        self.download_manager = DownloadManagerProxy(proxy)
        self.notification_manager = NotificationManagerProxy(proxy, plugin)

    @property
    def coreManager(self) -> CoreManager:
        return cast(CoreManager, self.core_manager)

    @property
    def deviceManager(self) -> DeviceManager:
        return cast(DeviceManager, self.device_manager)

    @property
    def downloadManager(self) -> DownloadManager:
        return cast(DownloadManager, self.download_manager)

    @property
    def notificationManager(self) -> NotificationManager:
        return cast(NotificationManager, self.notification_manager)

    @property
    def storageController(self) -> StorageController:
        return self.storage_controller

    @property
    def storagePath(self) -> str:
        return self.storage_path

    @staticmethod
    def _resolve_event(event: str | API_EVENT) -> str:
        return event.value if isinstance(event, API_EVENT) else event

    def on(self, event: str | API_EVENT, f: APIListener) -> Any:
        return super().on(self._resolve_event(event), f)

    def once(self, event: str | API_EVENT, f: APIListener) -> Any:
        return cast(Any, super().once(self._resolve_event(event), f))

    def off(
        self,
        event: str | API_EVENT,
        f: APIListener,
    ) -> Any:
        return super().remove_listener(self._resolve_event(event), f)

    def emit(self, event: str | API_EVENT, *args: Any, **kwargs: Any) -> bool:
        return super().emit(self._resolve_event(event), *args, **kwargs)

    def removeListener(self, event: str | API_EVENT, f: APIListener) -> None:
        api_event_type = str(event) if isinstance(event, API_EVENT) else event
        return super().remove_listener(api_event_type, f)

    def removeAllListeners(self, event: None | str | API_EVENT = None) -> None:
        api_event_type: None | str = None
        if event is not None:
            api_event_type = str(event) if isinstance(event, API_EVENT) else event
        return super().remove_all_listeners(api_event_type)
