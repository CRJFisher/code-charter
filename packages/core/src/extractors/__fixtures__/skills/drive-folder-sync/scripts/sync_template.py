"""Mirror a local folder to a Google Drive folder (fixture stand-in)."""


def sync(local_dir: str, drive_folder_id: str) -> None:
    print(f"syncing {local_dir} -> {drive_folder_id}")
