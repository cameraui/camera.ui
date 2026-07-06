from __future__ import annotations

from typing import TypedDict

from _camera_ui_tools.camera_ui_rpc import RPCClient
from _camera_ui_tools.camera_ui_sdk import Notification, NotificationManager
from plugins.runtime.python.namespaces import NamespaceManager
from plugins.runtime.python.typings import PluginInfo


class _PublishEnvelope(TypedDict):
    pluginId: str
    pluginName: str
    notification: Notification


class NotificationManagerProxy(NotificationManager):
    def __init__(self, proxy: RPCClient, plugin: PluginInfo) -> None:
        self.__proxy = proxy
        self.__plugin = plugin
        self.__namespaces = NamespaceManager.notification_manager_namespaces()

    async def publish(self, notification: Notification) -> None:
        if not notification.get("title"):
            raise ValueError("notification.title is required")
        envelope: _PublishEnvelope = {
            "pluginId": self.__plugin["id"],
            "pluginName": self.__plugin["name"],
            "notification": notification,
        }
        await self.__proxy.publish(self.__namespaces.notifications_publish_subject, envelope)
