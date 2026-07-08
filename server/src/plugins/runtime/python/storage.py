from __future__ import annotations

import asyncio
import inspect
from copy import deepcopy
from typing import TYPE_CHECKING, Any, ClassVar, cast

from deepdiff.diff import DeepDiff

from _camera_ui_tools.camera_ui_common import ObjectPath, merge, merge_with
from _camera_ui_tools.camera_ui_rpc import RPCMethod
from _camera_ui_tools.camera_ui_sdk import DeviceStorage as DeviceStorageInterface
from plugins.runtime.python.namespaces import NamespaceManager
from plugins.runtime.python.schema import (
    generate_config_from_schemas,
    get_value_by_key,
    is_button_type,
    is_submit_type,
    remove_callbacks_from_schemas,
)
from plugins.runtime.python.store import (
    PluginLocation,
    SensorLocation,
    delete_location,
    read_location,
    validate_store_value,
    write_location,
)

if TYPE_CHECKING:
    from _camera_ui_tools.camera_ui_rpc import CloseHandler, RPCClient
    from _camera_ui_tools.camera_ui_sdk import (
        FormSubmitResponse,
        JsonSchema,
        PluginAPI,
        SchemaConfig,
    )
    from plugins.runtime.python.config_db import PluginConfigDb
    from plugins.runtime.python.store import StoreLocation
    from plugins.runtime.python.typings import PluginInfo

ConfigDict = dict[str, Any]


def merge2(
    source: Any,
    target: Any,
    key: str | int | None,
    source_object: Any,
    target_object: Any,
    stack: list[dict[Any, Any]],
) -> Any:
    if isinstance(source, list):
        return target
    if target is None:
        return source
    return None


class DeviceStorage(DeviceStorageInterface):
    # Strong refs to detached onSet tasks: the event loop only holds weak
    # references, so an unreferenced task could be garbage-collected mid-flight.
    __detached_tasks: ClassVar[set[asyncio.Task[None]]] = set()

    def __init__(
        self,
        api: PluginAPI,
        proxy: RPCClient,
        plugin: PluginInfo,
        plugin_db: PluginConfigDb,
        location: StoreLocation,
        schemas: list[JsonSchema] | None = [],
        sensor_id: str | None = None,
    ) -> None:
        if schemas is None:
            schemas = []

        self.schemas: list[JsonSchema] = schemas
        self.values: dict[str, Any] = {}

        self.__api = api
        self.__proxy = proxy
        self.__plugin = plugin
        self.__plugin_db = plugin_db
        self.__location = location
        self.__sensor_id = sensor_id
        self.__close_proxy: CloseHandler | None = None
        self.__dirty = False

        if isinstance(location, SensorLocation):
            if not self.__sensor_id:
                raise ValueError(f"sensor storage for {plugin['id']} requires a sensor_id")
            sensor_ns = NamespaceManager.plugin_sensor_namespaces(
                plugin["id"], location.camera_id, self.__sensor_id
            )
            self.__storage_namespace = sensor_ns.sensor_storage_rpc
        elif isinstance(location, PluginLocation):
            plugin_ns = NamespaceManager.plugin_namespaces(plugin["id"])
            self.__storage_namespace = plugin_ns.plugin_storage_rpc
        else:
            camera_ns = NamespaceManager.plugin_camera_namespaces(plugin["id"], location.camera_id)
            self.__storage_namespace = camera_ns.camera_storage_rpc

    @RPCMethod
    async def getValue(self, key: str, default_value: Any | None = None) -> Any:
        schema: Any = next((schema for schema in self.schemas if schema["key"] == key), None)
        config_value = ObjectPath.get(self.values, key)
        schema_default_value = (
            schema["defaultValue"] if schema and "defaultValue" in schema and schema["defaultValue"] else None
        )

        if schema:
            on_get_function = schema.get("onGet", None)
            if on_get_function is not None:
                if inspect.iscoroutinefunction(on_get_function):
                    return await on_get_function()
                else:
                    res = on_get_function()

                    if inspect.iscoroutine(res):
                        return await res
                    else:
                        return on_get_function()  # type: ignore

        if config_value is not None:
            return config_value

        if schema_default_value is not None:
            return schema_default_value

        if default_value is not None:
            return default_value

        return None

    @RPCMethod
    async def setValue(self, key: str, new_value: Any) -> None:
        schema: Any = next((schema for schema in self.schemas if schema["key"] == key), None)

        if schema:
            validate_store_value(key, new_value)
            old_value = ObjectPath.get(self.values, key)
            if new_value is None:
                unchanged = old_value is None
                ObjectPath.delete(self.values, key)
            else:
                unchanged = old_value is not None and DeepDiff(old_value, new_value) == {}
                stored = (  # pyright: ignore[reportUnknownVariableType]
                    deepcopy(new_value)  # pyright: ignore[reportUnknownVariableType, reportUnknownArgumentType]
                    if isinstance(new_value, (dict, list))
                    else new_value
                )
                ObjectPath.set(self.values, key, stored)

            if self.__contains_storable_schema(schema) and (not unchanged or self.__dirty):
                await self.save()

            self.__run_on_set_detached(schema.get("onSet", None), key, new_value, old_value)

    @RPCMethod
    async def submitValue(self, key: str, new_value: Any) -> FormSubmitResponse | None:
        schema: Any = next((schema for schema in self.schemas if schema["key"] == key), None)

        if schema and schema["type"] == "submit":
            on_click_function = schema.get("onClick", None)
            if on_click_function:
                if inspect.iscoroutinefunction(on_click_function):
                    return await on_click_function(new_value)
                else:
                    res = on_click_function(new_value)

                    if inspect.iscoroutine(res):
                        return await res
                    else:
                        return on_click_function(new_value)

        return None

    @RPCMethod
    async def setInternalValue(self, key: str, value: Any) -> None:  # type: ignore[override]
        validate_store_value(key, value)
        old_value = ObjectPath.get(self.values, key)
        if value is None:
            unchanged = old_value is None
            ObjectPath.delete(self.values, key)
        else:
            unchanged = old_value is not None and DeepDiff(old_value, value) == {}
            stored = deepcopy(value) if isinstance(value, (dict, list)) else value  # type: ignore
            ObjectPath.set(self.values, key, stored)

        if unchanged and not self.__dirty:
            return
        await self.save()

    @RPCMethod
    def hasValue(self, key: str) -> bool:
        config_value = ObjectPath.get(self.values, key)
        return config_value is not None

    @RPCMethod
    async def getConfig(self) -> SchemaConfig:
        await self.__resolve_on_get_functions(self.schemas)
        filtered_schema: Any = remove_callbacks_from_schemas(self.schemas)
        schema_config: SchemaConfig = {"schema": filtered_schema, "config": self.values}
        return schema_config

    @RPCMethod
    async def setConfig(self, new_config: dict[str, Any]) -> None:
        validate_store_value("config", new_config)
        old_config = deepcopy(self.values)
        self.values = merge_with(self.values, new_config, merge)

        await self.save()
        self.__trigger_on_set_for_changes(old_config, self.values)

    @RPCMethod
    async def addSchema(self, schema: JsonSchema) -> None:
        if self.hasSchema(schema["key"]):
            raise Exception(f"Schema with key {schema['key']} already exists")

        self.schemas.append(schema)

        old_value = ObjectPath.get(self.values, schema["key"])
        await self.__resolve_on_get_functions(schema)

        new_value = ObjectPath.get(self.values, schema["key"])
        if (
            self.__contains_storable_schema(schema)
            and DeepDiff(old_value, new_value, ignore_order=True) != {}
        ):
            await self.save()

    @RPCMethod
    async def removeSchema(self, key: str) -> None:  # type: ignore[override]
        schema = next((schema for schema in self.schemas if schema["key"] == key), None)
        had_value = ObjectPath.get(self.values, key) is not None
        self.schemas = [s for s in self.schemas if s["key"] != key]
        ObjectPath.delete(self.values, key)

        if schema and self.__contains_storable_schema(schema) and had_value:
            await self.save()

    @RPCMethod
    async def changeSchema(self, key: str, new_schema: dict[str, Any]) -> None:
        new_schema["key"] = key
        schema = next(
            (schema for schema in self.schemas if schema["key"] == new_schema["key"]),
            None,
        )

        if schema:
            was_storable = self.__contains_storable_schema(schema)
            merge_with(schema, new_schema, merge)

            # Storable-ness flipped: the next write must persist even if the
            # value compares unchanged, otherwise the flip never becomes durable.
            if self.__contains_storable_schema(schema) != was_storable:
                self.__dirty = True

            old_value = ObjectPath.get(self.values, key)
            await self.__resolve_on_get_functions(schema)

            new_value = ObjectPath.get(self.values, key)
            if (
                self.__contains_storable_schema(schema)
                and DeepDiff(old_value, new_value, ignore_order=True) != {}
            ):
                await self.save()

    @RPCMethod
    def getSchema(self, key: str) -> JsonSchema | None:
        return next((schema for schema in self.schemas if schema["key"] == key), None)

    @RPCMethod
    def hasSchema(self, key: str) -> bool:
        return any(schema["key"] == key for schema in self.schemas)

    @RPCMethod
    async def destroy(self) -> None:
        config = self.__plugin_db.get("config") or {}
        delete_location(config, self.__location)
        self.values = {}
        await self.__plugin_db.put("config", config)

    async def save(self) -> None:  # type: ignore[override]
        config = self.__plugin_db.get("config") or {}

        if len(self.schemas) > 0:
            storable_config = self.__filter_storable_values(self.schemas)
        else:
            storable_config = self.values

        write_location(config, self.__location, storable_config)
        try:
            await self.__plugin_db.put("config", config)
        except Exception:
            self.__dirty = True
            raise
        self.__dirty = False

    def defineSchemas(self, schemas: list[JsonSchema]) -> None:
        self.schemas = schemas
        self.__initializeStorage()

    def update_schema(self, schemas: list[JsonSchema] = []) -> None:
        self.schemas = schemas
        self.__initializeStorage()

    async def register_storage(self) -> None:
        self.__close_proxy = await self.__proxy.register_handler(self.__storage_namespace, self)

    async def unregister_storage(self) -> None:
        if self.__close_proxy:
            await self.__close_proxy()

    # Internal method to close the storage
    async def close(self) -> None:
        try:
            await self.save()
            await self.unregister_storage()
        except Exception as error:
            cast(Any, self.__api).logger.error(f"store: close save failed: {error}")

    async def __resolve_on_get_functions(
        self,
        schemas: JsonSchema | list[JsonSchema],
    ) -> None:
        if not isinstance(schemas, list):
            schemas = [schemas]

        for schema in schemas:
            if not is_button_type(schema) and not is_submit_type(schema) and "onGet" in schema:
                schema_value = await self.getValue(schema["key"])
                if schema_value is not None:
                    ObjectPath.set(self.values, schema["key"], schema_value)

    def __trigger_on_set_for_changes(self, old_config: dict[str, Any], new_config: dict[str, Any]) -> None:
        for config_key in list(new_config.keys()):
            old_value: Any = get_value_by_key(old_config, config_key) or {}
            new_value: Any = new_config[config_key]

            if DeepDiff(old_value, new_value, ignore_order=True) != {}:
                schema = next(
                    (schema for schema in self.schemas if schema["key"] == config_key),
                    None,
                )
                if schema and schema["type"] != "submit" and "onSet" in schema:
                    self.__run_on_set_detached(schema.get("onSet", None), config_key, new_value, old_value)

    def __run_on_set_detached(self, on_set_function: Any, key: str, new_value: Any, old_value: Any) -> None:
        if not on_set_function:
            return

        async def _run() -> None:
            try:
                res = on_set_function(new_value, old_value)
                if inspect.iscoroutine(res):
                    await res
            except Exception as error:
                cast(Any, self.__api).logger.error(f'onSet handler for "{key}" failed: {error}')

        task = asyncio.create_task(_run())
        self.__detached_tasks.add(task)
        task.add_done_callback(self.__detached_tasks.discard)

    def __filter_storable_values(
        self,
        schemas: list[JsonSchema],
    ) -> ConfigDict:
        result: ConfigDict = {}

        for schema in schemas:
            if is_button_type(schema) or is_submit_type(schema):
                continue

            if "store" in schema and schema["store"]:
                config_value = get_value_by_key(self.values, schema["key"])
                ObjectPath.set(result, schema["key"], config_value)

        # Keys without any schema are internal values and always persist;
        # schema-covered keys persist only via their store flag above.
        for key, value in self.values.items():
            if not any(schema["key"] == key or schema["key"].startswith(f"{key}.") for schema in schemas):
                result[key] = value

        return result

    def __contains_storable_schema(
        self,
        schema: JsonSchema,
    ) -> bool:
        if is_button_type(schema) or is_submit_type(schema):
            return False

        return bool("store" in schema and schema["store"])

    def __initializeStorage(self) -> None:
        config = self.__plugin_db.get("config") or {}
        device_config = read_location(config, self.__location) or {}
        schema_config = generate_config_from_schemas(self.schemas)
        self.values = merge_with(schema_config, device_config, merge2)
