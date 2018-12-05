/*******************************************************************************
 * Copyright 2016, 2017 ARM Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *******************************************************************************/

#include <sys/stat.h>
#include <sys/types.h>
#include <sys/mount.h>
#include <errno.h>
#include <stdio.h>
#include <unistd.h>
#include <string.h>
#include <dirent.h>
#include <stdlib.h>

//PAL Includes
#include "pal.h"
#include "pal_plat_fileSystem.h"
#include "pal_plat_rtos.h"

#define TRACE_GROUP "PAL"

#define PAL_FS_COPY_BUFFER_SIZE 256                                                            //!< Size of the chunk to copy files

#ifndef PAL_FORMAT_CMD_MAX_LENGTH
    #define PAL_FORMAT_CMD_MAX_LENGTH 256
#endif

#ifndef PAL_DEVICE_NAME_MAX_LENGTH
    #define PAL_DEVICE_NAME_MAX_LENGTH  128
#endif

#ifndef PAL_PARTITION_FORMAT_TYPE
    #define PAL_PARTITION_FORMAT_TYPE "ext4"
#endif

/*\brief  overwrite format command with remove all file and directory*/
#ifndef PAL_SIMULATOR_FS_RM_INSTEAD_OF_FORMAT
    #define PAL_SIMULATOR_FS_RM_INSTEAD_OF_FORMAT 0
#endif

#ifndef PAL_FS_FORMAT_COMMAND
    #define PAL_FS_FORMAT_COMMAND "mkfs -F -t %s %s"
#endif


#ifndef PARTITION_FORMAT_ADDITIONAL_PARAMS
    #define PARTITION_FORMAT_ADDITIONAL_PARAMS NULL
#endif


PAL_PRIVATE const char* g_platOpenModeConvert[] = {"0", "r", "r+", "w+x", "w+"};                    //!< platform convert table for \b fopen() modes
PAL_PRIVATE const int g_platSeekWhenceConvert[] = {0, SEEK_SET, SEEK_CUR, SEEK_END};                //!< platform convert table for \b fseek() relative position modes



/*! \brief This function find the next file in a directory
 *
 * @param[in]    *dh - Directory handler to an open DIR
 * @param[out]    CurrentEntry - entry for the file found in Directory (pre allocated)
 *
 * \return true - upon successful operation.\n
 *
 */
PAL_PRIVATE bool pal_plat_findNextFile(DIR *dh, struct dirent ** CurrentEntry);

/*! \brief This function translate the platform errors opcode to pal error codes
 *
 * @param[in]    errorOpCode - platform opcode to be translated
 *
 * \return PAL_SUCCESS upon successful operation.\n
 */
PAL_PRIVATE palStatus_t pal_plat_errorTranslation (int errorOpCode);


/*! \brief This function build the full path name by adding the filename to the working path given in pathName arg
 *
 * @param[in]    *pathName - pointer to the null-terminated string that specifies the directory name.
 * @param[in]   *fileName - pointer to the file name
 * @param[out]    *fullPath - pointer to the full path including the filename (pre allocated)
 * @param[in]   fullPathSize - size of fullPath
 *
 * \return PAL_SUCCESS upon successful operation.\n
 *         PAL_FILE_SYSTEM_ERROR - see error code description \c palError_t
 *
 */
PAL_PRIVATE palStatus_t pal_plat_addFileNameToPath(const char *pathName, const char * fileName, char * fullPath, size_t fullPathSize);

/*! \brief This function copy one file from source folder to destination folder
*
* @param[in]  pathNameSrc - Pointer to a null-terminated string that specifies the source dir.
* @param[in]  pathNameDest - Pointer to a null-terminated string that specifies the destination dir
* @param[in] fileName - pointer the the file name
*
* \return PAL_SUCCESS upon successful operation.\n
*         PAL_FILE_SYSTEM_ERROR - see error code description \c palError_t
*
* \note File should not be open.\n
*         If the Destination file exist then it shall be truncated
*
*/
PAL_PRIVATE palStatus_t pal_plat_fsCpFile(const char *pathNameSrc,  char *pathNameDest, char * fileName);

palStatus_t pal_plat_fsMkdir(const char *pathName)
{
    palStatus_t ret = PAL_SUCCESS;
    int platStatus = 0;

    platStatus = mkdir(pathName, 0777);
    if (platStatus)
    {
        ret = pal_plat_errorTranslation(errno);
    }
    return ret;
}


palStatus_t pal_plat_fsRmdir(const char *pathName)
{
    palStatus_t ret = PAL_SUCCESS;

    if (rmdir(pathName))
    {
        if(errno == ENOENT)
        {
            ret = PAL_ERR_FS_NO_PATH;
        }
        else
        {
            ret = pal_plat_errorTranslation(errno);
        }
    }
    return ret;
}


palStatus_t pal_plat_fsFopen(const char *pathName, pal_fsFileMode_t mode, palFileDescriptor_t *fd)
{
    palStatus_t ret = PAL_SUCCESS;

    *fd = (palFileDescriptor_t)fopen(pathName, g_platOpenModeConvert[mode]);
    if ((*fd) == NULLPTR)
    {
        ret = pal_plat_errorTranslation(errno);
    }
    return ret;
}


palStatus_t pal_plat_fsFclose(palFileDescriptor_t *fd)
{
    palStatus_t ret = PAL_SUCCESS;
    if (fclose((FILE *)*fd))
    {
        ret = pal_plat_errorTranslation(errno);
    }

    return ret;
}


palStatus_t pal_plat_fsFread(palFileDescriptor_t *fd, void * buffer, size_t numOfBytes, size_t *numberOfBytesRead)
{
    palStatus_t ret = PAL_SUCCESS;
    *numberOfBytesRead = fread(buffer, 1, numOfBytes, (FILE *)*fd);
    if (*numberOfBytesRead != numOfBytes)
    {
        if (ferror((FILE *)*fd))
        {
            ret = PAL_ERR_FS_ERROR;
        }
        clearerr((FILE *)*fd);
    }
    return ret;
}


palStatus_t pal_plat_fsFwrite(palFileDescriptor_t *fd, const void *buffer, size_t numOfBytes, size_t *numberOfBytesWritten)
{
    palStatus_t ret = PAL_SUCCESS;
    *numberOfBytesWritten = fwrite(buffer, 1, numOfBytes, (FILE *)*fd);
    errno = 0;
    if (*numberOfBytesWritten != numOfBytes)
    {
        ret = pal_plat_errorTranslation(errno);
        if(ret == PAL_SUCCESS)
        {
            ret = PAL_ERR_FS_ACCESS_DENIED;
        }
    }
    return ret;
}


palStatus_t pal_plat_fsFseek(palFileDescriptor_t *fd, int32_t offset, pal_fsOffset_t whence)
{
    palStatus_t ret = PAL_SUCCESS;
    if (fseek((FILE *)*fd, offset, g_platSeekWhenceConvert[whence]))
    {
        ret = pal_plat_errorTranslation(errno);
    }
    return ret;
}


palStatus_t pal_plat_fsFtell(palFileDescriptor_t *fd, int32_t * pos)
{
    palStatus_t ret = PAL_SUCCESS;
    long retPos = 0;
    *pos = 0;
    retPos = ftell((FILE *)*fd);
    if (retPos < 0)
    {
        ret = pal_plat_errorTranslation(errno);
    }
    else
    {
        *pos = retPos;
    }
    return ret;
}


palStatus_t pal_plat_fsUnlink(const char *pathName)
{
    palStatus_t ret = PAL_SUCCESS;

    if (unlink(pathName))
    {
        ret = pal_plat_errorTranslation(errno);
    }
    return ret;
}


palStatus_t pal_plat_fsRmFiles(const char *pathName)
{
    DIR *dh = NULL; //Directory handler
    palStatus_t ret = PAL_SUCCESS;
    char buffer[PAL_MAX_FILE_AND_FOLDER_LENGTH] = {0}; //Buffer for coping the name and folder
    struct dirent * currentEntry = NULL; //file Entry


    dh = opendir(pathName);

    if (dh)
    {
        while(true)
        {
            if (!pal_plat_findNextFile(dh, &currentEntry))
            {
                ret = PAL_ERR_FS_ERROR_IN_SEARCHING;
                break;
            }
            if (currentEntry)
            {
                pal_plat_addFileNameToPath(pathName, currentEntry->d_name, buffer, sizeof(buffer));
                if (currentEntry->d_type == DT_DIR)
                {
                    pal_fsRmFiles(buffer);
                    if (rmdir(buffer))
                    {
                        ret = pal_plat_errorTranslation(errno);
                        break;
                    }
                }
                else
                {
                    if (unlink(buffer))
                    {
                        ret = pal_plat_errorTranslation(errno);
                        break;
                    }
                }
            }
            else
            {//End of directory reached  without errors break, close directory and exit
                break;
            }
        }//while()
    }
    else//if (dh)
    {
        ret = PAL_ERR_FS_NO_PATH;
    }

    if (dh)
    {
        closedir(dh); //Close DIR handler
    }
    return ret;
}


palStatus_t pal_plat_fsCpFolder(const char *pathNameSrc,  char *pathNameDest)
{
    DIR *src_dh = NULL; //Directory for the source Directory handler
    palStatus_t ret = PAL_SUCCESS;
    struct dirent * currentEntry = NULL; //file Entry


    src_dh = opendir(pathNameSrc);
    if (src_dh == NULL)
    {
        ret = PAL_ERR_FS_NO_PATH;
    }
    else
    {
        while(true)
        {
            if (!pal_plat_findNextFile(src_dh, &currentEntry))
            {
                ret = PAL_ERR_FS_ERROR_IN_SEARCHING;
                break;
            }
            if (currentEntry)
            {
                if (currentEntry->d_type == DT_DIR)
                {
                    continue;
                }
                //copy the file to the destination
                ret = pal_plat_fsCpFile(pathNameSrc, pathNameDest, currentEntry->d_name);
                if (ret != PAL_SUCCESS)
                {
                    break;
                }
            }
            else
            {//End of directory reached  without errors break and close directory and exit
                break;
            }
        }//while()
    }

    if (src_dh)
    {
        closedir(src_dh);
    }
    return ret;
}


PAL_PRIVATE palStatus_t pal_plat_fsCpFile(const char *pathNameSrc,  char *pathNameDest, char * fileName)
{
    palStatus_t ret = PAL_SUCCESS;
    palFileDescriptor_t src_fd = 0;
    palFileDescriptor_t dst_fd = 0;
    char buffer_name[PAL_MAX_FILE_AND_FOLDER_LENGTH] = {0}; //Buffer for coping the name and folder
    char * buffer = NULL;
    size_t bytesCount = 0;

    //Add file name to path
    pal_plat_addFileNameToPath(pathNameSrc, fileName, buffer_name, sizeof(buffer_name));
    src_fd = (palFileDescriptor_t)fopen(buffer_name, g_platOpenModeConvert[PAL_FS_FLAG_READONLY]);
    if (src_fd == 0)
    {
        ret = pal_plat_errorTranslation(errno);
    }
    else
    {
        //Add file name to path
        pal_plat_addFileNameToPath(pathNameDest, fileName, buffer_name, sizeof(buffer_name));
        dst_fd = (palFileDescriptor_t)fopen(buffer_name, g_platOpenModeConvert[PAL_FS_FLAG_READWRITETRUNC]);
        if (dst_fd == 0)
        {
            ret = pal_plat_errorTranslation(errno);
        }
        else
        {
            buffer = (char*)pal_plat_malloc(PAL_FS_COPY_BUFFER_SIZE);
            if (!buffer)
            {
                ret = PAL_ERR_RTOS_RESOURCE;
            }
        }
    }

    if (ret == PAL_SUCCESS)
    {
        while (1)
        {
            ret = pal_fsFread(&src_fd, buffer, PAL_FS_COPY_BUFFER_SIZE, &bytesCount);
            if (ret != PAL_SUCCESS)
            {
                break;
            }

            //Check if end of file reached
            if (bytesCount == 0)
            {
                break;
            }

            ret = pal_fsFwrite(&dst_fd, buffer, bytesCount, &bytesCount);
            if (ret != PAL_SUCCESS)
            {
                break;
            }
        }
    }

    if (src_fd != 0)
    {
        pal_fsFclose(&src_fd);
    }
    if (dst_fd != 0)
    {
        pal_fsFclose(&dst_fd);
    }
    if (buffer)
    {
        pal_plat_free(buffer);
    }
    return ret;
}


const char* pal_plat_fsGetDefaultRootFolder(pal_fsStorageID_t dataID)
{
    const char* returnedRoot = NULL;
    if (PAL_FS_PARTITION_PRIMARY == dataID)
    {
        returnedRoot = PAL_FS_MOUNT_POINT_PRIMARY;
    }
    else if (PAL_FS_PARTITION_SECONDARY == dataID)
    {
        returnedRoot = PAL_FS_MOUNT_POINT_SECONDARY;
    }

    return returnedRoot;
}


PAL_PRIVATE bool pal_plat_findNextFile(DIR *dh, struct dirent ** CurrentEntry)
{
    bool ret = true;
    bool skip = false;
    bool foundFile = false;

    do
    {
        errno = 0;
        *CurrentEntry = readdir(dh);
        if (*CurrentEntry)
        {
            /* Skip the names "." and ".." as we don't want to remove them. also make sure that the current entry point to REGULER file*/
            skip = (!strcmp((*CurrentEntry)->d_name, ".")) || (!strcmp((*CurrentEntry)->d_name, ".."));
            if (skip)
            {
                continue;
            }
            else
            {
                foundFile = true;
            }
        }
        else
        {//Check if EOF reached
            if (errno)
            {//NOT!!! EOF  other error
                ret = false;
            }
            break; //Break from while
        }
    }
    while((!foundFile) && (ret)); //While file has been found or ret is set to false
    return ret;
}

PAL_PRIVATE palStatus_t pal_plat_addFileNameToPath(const char *pathName, const char * fileName, char * fullPath, size_t fullPathSize)
{
    palStatus_t ret = PAL_SUCCESS;
    if ((strlen(pathName) >= PAL_MAX_FOLDER_DEPTH_CHAR)  || (strlen(fileName) >= PAL_MAX_FULL_FILE_NAME))
    {
        ret = PAL_ERR_FS_FILENAME_LENGTH;
    }
    else if (fullPath)
    {
        strncpy(fullPath, pathName, fullPathSize - 1);
        fullPath[fullPathSize - 1] = '\0';
        strncat(fullPath, "/", fullPathSize - strlen(fullPath) - 1);
        strncat(fullPath, fileName, fullPathSize - strlen(fullPath) - 1);
    }
    else
    {
        ret = PAL_ERR_RTOS_RESOURCE;
    }
    return ret;
}




PAL_PRIVATE palStatus_t pal_plat_errorTranslation (int errorOpCode)
{
    palStatus_t ret = PAL_SUCCESS;

    switch(errorOpCode)
    {
    case 0:
        break;
    case EACCES:
    case EFAULT:
    case EROFS:
        ret = PAL_ERR_FS_ACCESS_DENIED;
        break;

    case EBUSY :
        ret = PAL_ERR_FS_BUSY;
        break;

    case EEXIST:
        ret = PAL_ERR_FS_NAME_ALREADY_EXIST;
        break;

    case ENAMETOOLONG:
        ret = PAL_ERR_FS_FILENAME_LENGTH;
        break;

    case EBADF:
        ret = PAL_ERR_FS_BAD_FD;
        break;

    case EINVAL:
        ret = PAL_ERR_FS_INVALID_ARGUMENT;
        break;

    case EISDIR:
        ret = PAL_ERR_FS_FILE_IS_DIR;
        break;

    case ENOTEMPTY:
        ret = PAL_ERR_FS_DIR_NOT_EMPTY;
        break;

    case ENOENT:
        ret = PAL_ERR_FS_NO_FILE;
        break;

    default:
        ret = PAL_ERR_FS_ERROR;
        break;
    }
    return ret;
}


size_t pal_plat_fsSizeCheck(const char *stringToChk)
{
    size_t length = 0;
    length = strlen(stringToChk);
    return length;
}


palStatus_t pal_plat_fsFormat(pal_fsStorageID_t dataID)
{
    char rootFolder[PAL_MAX_FILE_AND_FOLDER_LENGTH] = {0};
    palStatus_t result = PAL_SUCCESS;
    result = pal_fsGetMountPoint(dataID, PAL_MAX_FILE_AND_FOLDER_LENGTH, rootFolder);
    if (PAL_SUCCESS == result)
    {
        printf("pal_plat_fsFormat rootFolder=%s\n", rootFolder);
    }
    return result;
}

