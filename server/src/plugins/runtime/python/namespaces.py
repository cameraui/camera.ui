from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class CoreManagerNamespaces:
    core_manager_subject: str
    core_manager_rpc: str


@dataclass(frozen=True, slots=True)
class DeviceManagerNamespaces:
    device_manager_subject: str
    device_manager_rpc: str


@dataclass(frozen=True, slots=True)
class FrameWorkerNamespaces:
    frame_worker_child_rpc: str
    frame_worker_child: str


@dataclass(frozen=True, slots=True)
class PluginNamespaces:
    plugin_device_manager_subject: str
    plugin_child_rpc: str
    plugin_child: str
    plugin_storage_rpc: str
    plugin_config_store_rpc: str


@dataclass(frozen=True, slots=True)
class CameraNamespaces:
    camera_subject: str
    camera_controller_rpc: str


@dataclass(frozen=True, slots=True)
class PluginCameraNamespaces:
    camera_interfaces_rpc: str
    camera_storage_rpc: str
    camera_impl_rpc: str


@dataclass(frozen=True, slots=True)
class PluginSensorNamespaces:
    sensor_storage_rpc: str


@dataclass(frozen=True, slots=True)
class SensorControllerNamespaces:
    sensor_subject: str
    sensor_rpc: str


@dataclass(frozen=True, slots=True)
class SensorEventNamespaces:
    sensor_subject: str


@dataclass(frozen=True, slots=True)
class SensorProviderNamespaces:
    sensor_rpc: str


@dataclass(frozen=True, slots=True)
class FrameWorkerDetectionNamespaces:
    detection_rpc: str


@dataclass(frozen=True, slots=True)
class DetectionEventNamespaces:
    detection_event_subject: str


@dataclass(frozen=True, slots=True)
class DiscoveryManagerNamespaces:
    discovery_manager_subject: str
    discovery_manager_rpc: str


@dataclass(frozen=True, slots=True)
class DownloadManagerNamespaces:
    download_manager_rpc: str


@dataclass(frozen=True, slots=True)
class NotificationManagerNamespaces:
    notifications_publish_subject: str


class NamespaceManager:
    @staticmethod
    def core_manager_namespaces() -> CoreManagerNamespaces:
        return CoreManagerNamespaces(
            core_manager_subject="coreManager.subscriber",
            core_manager_rpc="coreManager.rpc",
        )

    @staticmethod
    def device_manager_namespaces() -> DeviceManagerNamespaces:
        return DeviceManagerNamespaces(
            device_manager_subject="deviceManager.subscriber",
            device_manager_rpc="deviceManager.rpc",
        )

    @staticmethod
    def discovery_manager_namespaces() -> DiscoveryManagerNamespaces:
        return DiscoveryManagerNamespaces(
            discovery_manager_subject="discoveryManager.subscriber",
            discovery_manager_rpc="discoveryManager.rpc",
        )

    @staticmethod
    def download_manager_namespaces() -> DownloadManagerNamespaces:
        return DownloadManagerNamespaces(
            download_manager_rpc="downloadManager.rpc",
        )

    @staticmethod
    def plugin_file_serve_rpc(plugin_id: str) -> str:
        return f"plugin.{plugin_id}.fileserve.rpc"

    @staticmethod
    def notification_manager_namespaces() -> NotificationManagerNamespaces:
        return NotificationManagerNamespaces(
            notifications_publish_subject="notifications.publish",
        )

    @staticmethod
    def plugin_namespaces(plugin_id: str) -> PluginNamespaces:
        return PluginNamespaces(
            plugin_device_manager_subject=f"plugin.{plugin_id}.deviceManager.subscriber",
            plugin_child_rpc=f"plugin.{plugin_id}.child.rpc",
            plugin_child=f"plugin.{plugin_id}.child",
            plugin_storage_rpc=f"plugin.{plugin_id}.storage.rpc",
            plugin_config_store_rpc=f"plugin.{plugin_id}.configstore.rpc",
        )

    @staticmethod
    def camera_namespaces(camera_id: str) -> CameraNamespaces:
        return CameraNamespaces(
            camera_subject=f"camera.{camera_id}.subscriber",
            camera_controller_rpc=f"camera.{camera_id}.controller.rpc",
        )

    @staticmethod
    def frame_worker_namespaces(camera_id: str) -> FrameWorkerNamespaces:
        return FrameWorkerNamespaces(
            frame_worker_child_rpc=f"camera.{camera_id}.frameWorker.child.rpc",
            frame_worker_child=f"camera.{camera_id}.frameWorker.child",
        )

    @staticmethod
    def plugin_camera_namespaces(plugin_id: str, camera_id: str) -> PluginCameraNamespaces:
        return PluginCameraNamespaces(
            camera_interfaces_rpc=f"plugin.{plugin_id}.camera.{camera_id}.cameraInterfaces.rpc",
            camera_storage_rpc=f"plugin.{plugin_id}.camera.{camera_id}.cameraStorage.rpc",
            camera_impl_rpc=f"plugin.{plugin_id}.camera.{camera_id}.impl.rpc",
        )

    @staticmethod
    def plugin_sensor_namespaces(plugin_id: str, camera_id: str, sensor_id: str) -> PluginSensorNamespaces:
        return PluginSensorNamespaces(
            sensor_storage_rpc=f"plugin.{plugin_id}.camera.{camera_id}.sensor.{sensor_id}.storage.rpc",
        )

    @staticmethod
    def sensor_controller_namespaces(camera_id: str) -> SensorControllerNamespaces:
        return SensorControllerNamespaces(
            sensor_subject=f"camera.{camera_id}.sensors.subject",
            sensor_rpc=f"camera.{camera_id}.sensors.rpc",
        )

    @staticmethod
    def sensor_event_namespaces(camera_id: str, sensor_id: str) -> SensorEventNamespaces:
        return SensorEventNamespaces(
            sensor_subject=f"camera.{camera_id}.sensor.{sensor_id}.subject",
        )

    @staticmethod
    def sensor_provider_namespaces(
        plugin_id: str, camera_id: str, sensor_id: str
    ) -> SensorProviderNamespaces:
        return SensorProviderNamespaces(
            sensor_rpc=f"plugin.{plugin_id}.camera.{camera_id}.sensor.{sensor_id}.rpc",
        )

    @staticmethod
    def frame_worker_detection_namespaces(camera_id: str) -> FrameWorkerDetectionNamespaces:
        return FrameWorkerDetectionNamespaces(
            detection_rpc=f"camera.{camera_id}.frameWorker.detection.rpc",
        )

    @staticmethod
    def detection_event_namespaces(camera_id: str) -> DetectionEventNamespaces:
        return DetectionEventNamespaces(
            detection_event_subject=f"camera.{camera_id}.events.subject",
        )

    @staticmethod
    def sensor_controller_rpc(camera_id: str) -> str:
        return f"camera.{camera_id}.sensors.controller.rpc"
